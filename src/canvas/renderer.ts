import { resolveCameraAtFrame, solveForwardKinematics } from '../engine/math';
import {
  getOnionSkinNeighbors,
  resolveCelAtFrame,
  resolveLayerTransformAtFrame,
} from '../engine/timeline';
import type {
  BlendMode,
  CelFrame,
  CompositeEffect,
  GuideConfig,
  Layer,
  OnionSkinConfig,
  Scene,
  VectorStroke,
} from '../engine/types';

const imageCache = new Map<string, HTMLImageElement>();

export function getCachedImage(dataUrl: string, onLoad?: () => void): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  const cached = imageCache.get(dataUrl);
  if (cached) {
    return cached.complete ? cached : null;
  }
  const img = new Image();
  img.onload = () => {
    if (onLoad) onLoad();
  };
  img.src = dataUrl;
  imageCache.set(dataUrl, img);
  return img.complete ? img : null;
}

function mapBlendMode(mode: BlendMode): GlobalCompositeOperation {
  switch (mode) {
    case 'multiply':
      return 'multiply';
    case 'screen':
      return 'screen';
    case 'overlay':
      return 'overlay';
    case 'lighter':
      return 'lighter';
    case 'darken':
      return 'darken';
    case 'lighten':
      return 'lighten';
    default:
      return 'source-over';
  }
}

export function drawVectorStroke(
  ctx: CanvasRenderingContext2D,
  stroke: VectorStroke
): void {
  const pts = stroke.points;
  if (pts.length === 0) return;

  ctx.save();
  ctx.globalAlpha = Math.max(0.02, Math.min(1, stroke.opacity));
  if (stroke.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.fillStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (stroke.tool === 'text' && stroke.text) {
    const p = pts[0];
    ctx.font = `600 ${Math.max(12, stroke.size * 3.5)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText(stroke.text, p.x, p.y);
    ctx.restore();
    return;
  }

  if (stroke.tool === 'line' && pts.length >= 2) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    ctx.lineWidth = stroke.size;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (stroke.tool === 'rect' && pts.length >= 2) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    ctx.lineWidth = stroke.size;
    if (stroke.fill) {
      ctx.fillRect(x, y, w, h);
    } else {
      ctx.strokeRect(x, y, w, h);
    }
    ctx.restore();
    return;
  }

  if (stroke.tool === 'ellipse' && pts.length >= 2) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const rx = Math.max(1, Math.abs(b.x - a.x) / 2);
    const ry = Math.max(1, Math.abs(b.y - a.y) / 2);
    ctx.lineWidth = stroke.size;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    if (stroke.fill) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  // Freehand stroke (pencil / brush / pen / eraser across 31 brush physics types)
  const isCloud = stroke.texture.startsWith('cloud-');

  if (isCloud) {
    const isEraser = stroke.tool === 'eraser';
    interface CloudLobe {
      x: number;
      y: number;
      r: number;
      angle: number;
      isTop?: boolean;
    }

    const lobes: CloudLobe[] = [];
    const baseSize = Math.max(6, stroke.size);
    const sampleStep = Math.max(7, baseSize * (stroke.texture === 'cloud-cirrus' ? 0.34 : 0.44));

    const pushPuffCluster = (cx: number, cy: number, pScale: number, angle: number, idx: number) => {
      const r = Math.max(4, baseSize * (0.35 + pScale * 0.48));
      // Multi-harmonic size modulation creates large cumulus peaks & smaller valleys
      const wave = 0.55 + 0.85 * Math.abs(Math.sin(idx * 1.15 + 0.4));
      const domeR = r * wave;

      if (stroke.texture === 'cloud-anime-cel' || stroke.texture === 'cloud-cumulus') {
        const lift = Math.abs(Math.sin(idx * 1.65)) * r * 0.52;
        lobes.push({ x: cx, y: cy - lift * 0.65, r: domeR, angle, isTop: true });
        lobes.push({
          x: cx + Math.cos(idx * 2.7) * r * 0.5,
          y: cy + r * 0.14,
          r: r * (0.58 + (idx % 3) * 0.12),
          angle,
        });
        if (idx % 2 === 0) {
          lobes.push({
            x: cx - Math.sin(idx * 2.1) * r * 0.48,
            y: cy - lift * 0.9 - r * 0.15,
            r: domeR * 0.68,
            angle,
            isTop: true,
          });
        }
      } else if (stroke.texture === 'cloud-nimbus') {
        const lift = Math.abs(Math.cos(idx * 1.3)) * r * 0.42;
        lobes.push({ x: cx, y: cy - lift * 0.45, r: domeR * 1.08, angle, isTop: true });
        lobes.push({
          x: cx + Math.sin(idx * 2.3) * r * 0.65,
          y: cy + r * 0.24,
          r: r * 0.72,
          angle,
        });
      } else {
        // cloud-cirrus or cloud-mist
        lobes.push({
          x: cx + Math.cos(idx * 2.9) * r * 0.25,
          y: cy + Math.sin(idx * 2.3) * r * 0.22,
          r: domeR,
          angle,
        });
      }
    };

    if (pts.length === 1) {
      pushPuffCluster(pts[0].x, pts[0].y, pts[0].pressure, 0, 1);
      pushPuffCluster(pts[0].x + baseSize * 0.36, pts[0].y + baseSize * 0.08, pts[0].pressure * 0.85, 0, 2);
      pushPuffCluster(pts[0].x - baseSize * 0.34, pts[0].y + baseSize * 0.1, pts[0].pressure * 0.8, 0, 3);
    } else {
      let carry = 0;
      let sampleIdx = 0;
      pushPuffCluster(pts[0].x, pts[0].y, pts[0].pressure, Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x), 0);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.01) continue;
        const angle = Math.atan2(dy, dx);
        let d = sampleStep - carry;
        while (d <= dist) {
          const t = d / dist;
          sampleIdx++;
          pushPuffCluster(
            a.x + dx * t,
            a.y + dy * t,
            a.pressure + (b.pressure - a.pressure) * t,
            angle,
            sampleIdx
          );
          d += sampleStep;
        }
        carry = dist - (d - sampleStep);
      }
    }

    if (stroke.texture === 'cloud-anime-cel') {
      // Pass 1: Whole crisp underside cel shadow silhouette (no overlapping internal scales)
      if (!isEraser) {
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(72, 102, 162, 0.36)';
        ctx.globalAlpha = stroke.opacity;
        for (const l of lobes) {
          ctx.beginPath();
          ctx.arc(l.x + l.r * 0.08, l.y + l.r * 0.24, l.r * 0.98, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      // Pass 2: Main solid crisp cel cloud silhouette
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.fillStyle = isEraser ? 'rgba(0,0,0,1)' : stroke.color;
      ctx.globalAlpha = stroke.opacity;
      for (const l of lobes) {
        ctx.beginPath();
        ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Pass 3: Bright sunlit upper rim peaks
      if (!isEraser) {
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.globalAlpha = stroke.opacity * 0.85;
        for (const l of lobes) {
          if (!l.isTop) continue;
          ctx.beginPath();
          ctx.arc(l.x - l.r * 0.08, l.y - l.r * 0.16, l.r * 0.72, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    } else if (stroke.texture === 'cloud-cumulus') {
      // Pass 1: Soft underside atmospheric shadow
      if (!isEraser) {
        ctx.save();
        ctx.shadowColor = 'rgba(85, 112, 165, 0.32)';
        ctx.shadowBlur = Math.max(6, baseSize * 0.28);
        ctx.fillStyle = 'rgba(85, 112, 165, 0.28)';
        ctx.globalAlpha = stroke.opacity * 0.75;
        for (const l of lobes) {
          ctx.beginPath();
          ctx.ellipse(l.x + l.r * 0.05, l.y + l.r * 0.26, l.r * 1.02, l.r * 0.72, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      // Pass 2: Soft billowing main cloud domes
      ctx.save();
      ctx.shadowColor = isEraser ? 'rgba(0,0,0,1)' : stroke.color;
      ctx.shadowBlur = Math.max(5, baseSize * 0.26);
      ctx.fillStyle = isEraser ? 'rgba(0,0,0,1)' : stroke.color;
      ctx.globalAlpha = stroke.opacity * 0.84;
      for (const l of lobes) {
        ctx.beginPath();
        ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Pass 3: Sunlit top dome highlights
      if (!isEraser) {
        ctx.shadowColor = 'rgba(255,255,255,0.35)';
        ctx.shadowBlur = Math.max(4, baseSize * 0.2);
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.globalAlpha = stroke.opacity * 0.8;
        for (const l of lobes) {
          if (!l.isTop) continue;
          ctx.beginPath();
          ctx.arc(l.x - l.r * 0.06, l.y - l.r * 0.18, l.r * 0.68, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    } else if (stroke.texture === 'cloud-nimbus') {
      // Pass 1: Heavy flat-bottomed dark storm cloud bank
      if (!isEraser) {
        ctx.save();
        ctx.shadowColor = 'rgba(14, 18, 30, 0.45)';
        ctx.shadowBlur = Math.max(8, baseSize * 0.35);
        ctx.fillStyle = 'rgba(16, 22, 36, 0.48)';
        ctx.globalAlpha = stroke.opacity * 0.92;
        for (const l of lobes) {
          ctx.beginPath();
          ctx.ellipse(l.x, l.y + l.r * 0.32, l.r * 1.15, l.r * 0.56, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      // Pass 2: Dense turbulent upper cloud volumes
      ctx.save();
      ctx.shadowColor = isEraser ? 'rgba(0,0,0,1)' : stroke.color;
      ctx.shadowBlur = Math.max(6, baseSize * 0.32);
      ctx.fillStyle = isEraser ? 'rgba(0,0,0,1)' : stroke.color;
      ctx.globalAlpha = stroke.opacity * 0.8;
      for (const l of lobes) {
        ctx.beginPath();
        ctx.arc(l.x, l.y - l.r * 0.08, l.r * 0.96, 0, Math.PI * 2);
        ctx.fill();
      }
      // Pass 3: Subtle rim catchlight on highest storm domes
      if (!isEraser) {
        ctx.fillStyle = 'rgba(210, 225, 245, 0.16)';
        ctx.globalAlpha = stroke.opacity * 0.7;
        for (const l of lobes) {
          if (!l.isTop) continue;
          ctx.beginPath();
          ctx.arc(l.x, l.y - l.r * 0.25, l.r * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    } else if (stroke.texture === 'cloud-cirrus') {
      ctx.save();
      ctx.shadowColor = isEraser ? 'rgba(0,0,0,1)' : stroke.color;
      ctx.shadowBlur = Math.max(3, baseSize * 0.18);
      for (let idx = 0; idx < lobes.length; idx++) {
        const l = lobes[idx];
        for (let w = 0; w < 3; w++) {
          const spread = (w - 1) * l.r * 0.36;
          const tilt = l.angle + Math.sin(idx * 1.9 + w) * 0.15;
          const px = l.x - Math.sin(l.angle) * spread;
          const py = l.y + Math.cos(l.angle) * spread;
          ctx.globalAlpha = stroke.opacity * (0.24 + (w % 2) * 0.14);
          ctx.beginPath();
          ctx.ellipse(
            px,
            py,
            l.r * (1.45 + (w % 2) * 0.45),
            Math.max(1.4, l.r * 0.16),
            tilt,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }
      ctx.restore();
    } else {
      // cloud-mist: smooth horizontal atmospheric haze
      ctx.save();
      ctx.shadowColor = isEraser ? 'rgba(0,0,0,1)' : stroke.color;
      ctx.shadowBlur = Math.max(8, baseSize * 0.42);
      for (let idx = 0; idx < lobes.length; idx++) {
        const l = lobes[idx];
        ctx.globalAlpha = stroke.opacity * 0.22;
        ctx.beginPath();
        ctx.ellipse(l.x, l.y, l.r * 1.75, l.r * 0.48, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.restore();
    return;
  }

  if (pts.length === 1) {
    const p = pts[0];
    const r = Math.max(0.8, (stroke.size * p.pressure) / 2);
    if (stroke.texture === 'pixel') {
      const s = Math.max(2, Math.round(stroke.size));
      ctx.fillRect(Math.floor(p.x / s) * s, Math.floor(p.y / s) * s, s, s);
    } else if (stroke.texture === 'sparkle') {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - r * 1.6);
      ctx.lineTo(p.x + r * 0.4, p.y - r * 0.4);
      ctx.lineTo(p.x + r * 1.6, p.y);
      ctx.lineTo(p.x + r * 0.4, p.y + r * 0.4);
      ctx.lineTo(p.x, p.y + r * 1.6);
      ctx.lineTo(p.x - r * 0.4, p.y + r * 0.4);
      ctx.lineTo(p.x - r * 1.6, p.y);
      ctx.lineTo(p.x - r * 0.4, p.y - r * 0.4);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  if (stroke.texture === 'glow' && stroke.tool !== 'eraser') {
    ctx.shadowColor = stroke.color;
    ctx.shadowBlur = Math.max(8, stroke.size * 1.4);
  } else if (stroke.texture === 'airbrush' || stroke.texture === 'smudge-soft') {
    ctx.shadowColor = stroke.tool === 'eraser' ? 'rgba(0,0,0,1)' : stroke.color;
    ctx.shadowBlur = Math.max(8, stroke.size * 0.9);
  } else if (stroke.hardness < 0.7 && stroke.tool === 'brush') {
    ctx.shadowColor = stroke.color;
    ctx.shadowBlur = (1 - stroke.hardness) * stroke.size * 0.85;
  }

  if (stroke.texture === 'marker' || stroke.texture === 'highlighter' || stroke.texture === 'palette-knife') {
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'bevel';
  }

  if (stroke.texture === 'dashed') {
    ctx.setLineDash([Math.max(4, stroke.size * 2), Math.max(4, stroke.size * 1.6)]);
  } else if (stroke.texture === 'dotted') {
    ctx.setLineDash([0.5, Math.max(4, stroke.size * 1.75)]);
  }

  const halftoneSeen = stroke.texture === 'halftone' ? new Set<string>() : null;

  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const pressure = (prev.pressure + curr.pressure) / 2;
    let width = Math.max(0.75, stroke.size * (0.35 + pressure * 0.85));

    if (stroke.texture === 'pixel') {
      const cell = Math.max(2, Math.round(stroke.size));
      const steps = Math.max(
        1,
        Math.ceil(Math.hypot(curr.x - prev.x, curr.y - prev.y) / (cell * 0.5))
      );
      for (let s = 0; s <= steps; s++) {
        const px = prev.x + ((curr.x - prev.x) * s) / steps;
        const py = prev.y + ((curr.y - prev.y) * s) / steps;
        ctx.fillRect(Math.floor(px / cell) * cell, Math.floor(py / cell) * cell, cell, cell);
      }
      continue;
    }

    if (stroke.texture === 'halftone' && halftoneSeen) {
      const step = Math.max(5, Math.round(stroke.size * 0.34));
      const radius = Math.max(step, stroke.size * (0.45 + pressure * 0.45));
      const x0 = Math.floor((curr.x - radius) / step) * step;
      const x1 = Math.ceil((curr.x + radius) / step) * step;
      const y0 = Math.floor((curr.y - radius) / step) * step;
      const y1 = Math.ceil((curr.y + radius) / step) * step;
      for (let gx = x0; gx <= x1; gx += step) {
        for (let gy = y0; gy <= y1; gy += step) {
          const dist = Math.hypot(gx - curr.x, gy - curr.y);
          if (dist <= radius) {
            const key = `${gx},${gy}`;
            if (halftoneSeen.has(key)) continue;
            halftoneSeen.add(key);
            const dotR = Math.max(1.1, step * 0.34 * (1 - (dist / radius) * 0.45));
            ctx.beginPath();
            ctx.arc(gx, gy, dotR, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      continue;
    }

    if (stroke.texture === 'sparkle') {
      const segDist = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      if (i % 2 === 1 || segDist > stroke.size * 0.7) {
        const starR = Math.max(3, width * (0.45 + ((i * 37) % 10) * 0.06));
        const ox = Math.sin(i * 13.1) * width * 0.4;
        const oy = Math.cos(i * 17.7) * width * 0.4;
        const sx = curr.x + ox;
        const sy = curr.y + oy;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(sx, sy - starR);
        ctx.lineTo(sx + starR * 0.24, sy - starR * 0.24);
        ctx.lineTo(sx + starR, sy);
        ctx.lineTo(sx + starR * 0.24, sy + starR * 0.24);
        ctx.lineTo(sx, sy + starR);
        ctx.lineTo(sx - starR * 0.24, sy + starR * 0.24);
        ctx.lineTo(sx - starR, sy);
        ctx.lineTo(sx - starR * 0.24, sy - starR * 0.24);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = stroke.opacity * 0.55;
        ctx.beginPath();
        ctx.arc(sx - ox * 1.4, sy - oy * 1.4, Math.max(1, starR * 0.16), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      continue;
    }

    if (stroke.texture === 'spray') {
      const radius = Math.max(4, stroke.size * 0.9);
      const count = Math.max(5, Math.round(stroke.size * 0.5));
      for (let d = 0; d < count; d++) {
        const a = ((i * 73 + d * 137) % 360) * (Math.PI / 180);
        const dist = (((i * 29 + d * 53) % 100) / 100) * radius;
        const dotR = 0.8 + (d % 3) * 0.7;
        ctx.beginPath();
        ctx.arc(curr.x + Math.cos(a) * dist, curr.y + Math.sin(a) * dist, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
      continue;
    }

    if (stroke.texture === 'chalk') {
      const radius = Math.max(4, width * 0.65);
      const grains = Math.max(8, Math.round(width * 0.7));
      ctx.save();
      for (let g = 0; g < grains; g++) {
        const a = ((i * 47 + g * 97) % 360) * (Math.PI / 180);
        const d = (((i * 31 + g * 67) % 100) / 100) * radius;
        ctx.globalAlpha = stroke.opacity * (0.12 + (g % 4) * 0.08);
        ctx.fillRect(curr.x + Math.cos(a) * d, curr.y + Math.sin(a) * d, 2.5, 2.5);
      }
      ctx.restore();
      continue;
    }

    if (stroke.texture === 'crosshatch') {
      const len = Math.max(6, width * 0.75);
      ctx.save();
      ctx.lineWidth = Math.max(1, stroke.size * 0.09);
      ctx.beginPath();
      ctx.moveTo(curr.x - len * 0.5, curr.y - len * 0.5);
      ctx.lineTo(curr.x + len * 0.5, curr.y + len * 0.5);
      if (i % 2 === 0) {
        ctx.moveTo(curr.x - len * 0.5, curr.y + len * 0.5);
        ctx.lineTo(curr.x + len * 0.5, curr.y - len * 0.5);
      }
      ctx.stroke();
      ctx.restore();
      continue;
    }

    if (stroke.texture === 'fur') {
      const angle = Math.atan2(curr.y - prev.y, curr.x - prev.x);
      const perp = angle + Math.PI / 2;
      ctx.save();
      ctx.lineWidth = Math.max(0.9, stroke.size * 0.09);
      for (let f = -2; f <= 2; f++) {
        const off = f * (width * 0.2);
        const tilt = angle + f * 0.22 + Math.sin(i + f) * 0.12;
        const bx = curr.x + Math.cos(perp) * off;
        const by = curr.y + Math.sin(perp) * off;
        const hairLen = width * (0.55 + (Math.abs(f) % 2) * 0.25);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(tilt) * hairLen, by + Math.sin(tilt) * hairLen);
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }

    if (stroke.texture === 'fountain') {
      const progress = i / Math.max(1, pts.length - 1);
      const endTaper = Math.min(1, progress * 5, (1 - progress) * 5 + 0.15);
      width = Math.max(0.6, stroke.size * (0.25 + pressure * 0.9) * endTaper);
    } else if (stroke.texture === 'pencil-hb') {
      width = Math.max(0.65, stroke.size * (0.3 + pressure * 0.65));
    } else if (stroke.texture === 'calligraphy') {
      const segAngle = Math.atan2(curr.y - prev.y, curr.x - prev.x);
      const nibAngle = -Math.PI / 4;
      const factor = 0.25 + 0.95 * Math.abs(Math.sin(segAngle - nibAngle));
      width = Math.max(1, stroke.size * factor * (0.5 + pressure * 0.6));
    } else if (stroke.texture === 'highlighter') {
      width = Math.max(4, stroke.size * 1.15);
    } else if (stroke.texture === 'palette-knife') {
      const segAngle = Math.atan2(curr.y - prev.y, curr.x - prev.x);
      const bladeFactor = 0.35 + 0.85 * Math.abs(Math.cos(segAngle - Math.PI / 6));
      width = Math.max(2, stroke.size * bladeFactor);
    }

    if (stroke.texture === 'gouache' || stroke.texture === 'oil-impasto') {
      const segAngle = Math.atan2(curr.y - prev.y, curr.x - prev.x);
      const perp = segAngle + Math.PI / 2;
      const strands = 5;
      ctx.save();
      for (let b = 0; b < strands; b++) {
        const ratio = (b / (strands - 1) - 0.5) * 0.82;
        const off = ratio * width;
        const ox = Math.cos(perp) * off;
        const oy = Math.sin(perp) * off;
        ctx.lineWidth = Math.max(1.2, width * (stroke.texture === 'oil-impasto' ? 0.32 : 0.24));
        ctx.globalAlpha = stroke.opacity * (0.72 + (b % 2) * 0.22);
        ctx.beginPath();
        ctx.moveTo(prev.x + ox, prev.y + oy);
        ctx.lineTo(curr.x + ox, curr.y + oy);
        ctx.stroke();
      }
      if (stroke.texture === 'oil-impasto') {
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = Math.max(1, width * 0.14);
        ctx.beginPath();
        ctx.moveTo(prev.x + Math.cos(perp) * width * 0.28, prev.y + Math.sin(perp) * width * 0.28);
        ctx.lineTo(curr.x + Math.cos(perp) * width * 0.28, curr.y + Math.sin(perp) * width * 0.28);
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }

    if (stroke.texture === 'ribbon') {
      const segAngle = Math.atan2(curr.y - prev.y, curr.x - prev.x);
      const perp = segAngle + Math.PI / 2;
      const halfW = width * 0.5;
      ctx.save();
      ctx.fillStyle = stroke.color;
      ctx.beginPath();
      ctx.moveTo(prev.x + Math.cos(perp) * halfW, prev.y + Math.sin(perp) * halfW);
      ctx.lineTo(curr.x + Math.cos(perp) * halfW, curr.y + Math.sin(perp) * halfW);
      ctx.lineTo(curr.x - Math.cos(perp) * halfW, curr.y - Math.sin(perp) * halfW);
      ctx.lineTo(prev.x - Math.cos(perp) * halfW, prev.y - Math.sin(perp) * halfW);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(prev.x + Math.cos(perp) * halfW, prev.y + Math.sin(perp) * halfW);
      ctx.lineTo(curr.x + Math.cos(perp) * halfW, curr.y + Math.sin(perp) * halfW);
      ctx.moveTo(prev.x - Math.cos(perp) * halfW, prev.y - Math.sin(perp) * halfW);
      ctx.lineTo(curr.x - Math.cos(perp) * halfW, curr.y - Math.sin(perp) * halfW);
      ctx.stroke();
      ctx.restore();
      continue;
    }

    ctx.lineWidth = width;
    ctx.beginPath();
    if (i < pts.length - 1) {
      const next = pts[i + 1];
      const mx = (curr.x + next.x) / 2;
      const my = (curr.y + next.y) / 2;
      ctx.moveTo(prev.x, prev.y);
      ctx.quadraticCurveTo(curr.x, curr.y, mx, my);
    } else {
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(curr.x, curr.y);
    }
    ctx.stroke();

    if (stroke.texture === 'glow' && stroke.tool !== 'eraser') {
      ctx.save();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = Math.max(1, width * 0.32);
      ctx.shadowBlur = 0;
      ctx.stroke();
      ctx.restore();
    }

    if (stroke.texture === 'watercolor') {
      ctx.save();
      ctx.globalAlpha = stroke.opacity * 0.18;
      ctx.lineWidth = width * 1.45;
      ctx.stroke();
      ctx.restore();
    }

    if (stroke.texture === 'smudge-soft') {
      ctx.save();
      ctx.globalAlpha = stroke.opacity * 0.25;
      ctx.lineWidth = width * 1.6;
      ctx.stroke();
      ctx.restore();
    }

    if ((stroke.texture === 'charcoal' || stroke.texture === 'pencil-hb') && i % 2 === 0) {
      ctx.save();
      ctx.globalAlpha = stroke.opacity * (stroke.texture === 'pencil-hb' ? 0.14 : 0.25);
      const jitterX = Math.sin(i * 19.3) * (width * 0.45);
      const jitterY = Math.cos(i * 11.7) * (width * 0.45);
      ctx.fillRect(curr.x + jitterX, curr.y + jitterY, 1.5, 1.5);
      ctx.restore();
    }

    if (stroke.texture === 'crayon') {
      ctx.save();
      ctx.globalAlpha = stroke.opacity * 0.35;
      for (let g = 0; g < 3; g++) {
        const gx = Math.sin(i * 13.7 + g * 5.1) * width * 0.45;
        const gy = Math.cos(i * 9.2 + g * 7.3) * width * 0.45;
        ctx.fillRect(curr.x + gx, curr.y + gy, 2.2, 2.2);
      }
      ctx.restore();
    }

    if (stroke.texture === 'ink-grain' && i % 3 === 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(curr.x, curr.y, Math.max(0.8, width * 0.18), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.restore();
}

export function drawCelContent(
  ctx: CanvasRenderingContext2D,
  cel: CelFrame,
  onImageLoad?: () => void
): void {
  if (cel.rasterDataUrl) {
    const img = getCachedImage(cel.rasterDataUrl, onImageLoad);
    if (img) {
      ctx.drawImage(img, 0, 0);
    }
  }
  for (const stroke of cel.strokes) {
    drawVectorStroke(ctx, stroke);
  }
}

function drawTintedCel(
  ctx: CanvasRenderingContext2D,
  cel: CelFrame,
  width: number,
  height: number,
  tintColor: string,
  opacity: number,
  onImageLoad?: () => void
): void {
  const scratch = document.createElement('canvas');
  scratch.width = width;
  scratch.height = height;
  const sctx = scratch.getContext('2d');
  if (!sctx) return;

  drawCelContent(sctx, cel, onImageLoad);
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = tintColor;
  sctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(scratch, 0, 0);
  ctx.restore();
}

function applyCompositingEffects(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  effects: CompositeEffect[],
  frame: number
): void {
  const enabled = effects.filter((e) => e.enabled);
  if (enabled.length === 0) return;

  // Color grade / blur via canvas filter pass
  const colorGrade = enabled.find((e) => e.type === 'color-grade');
  const gBlur = enabled.find((e) => e.type === 'gaussian-blur');
  const mBlur = enabled.find((e) => e.type === 'motion-blur');

  if (colorGrade || gBlur) {
    const snap = document.createElement('canvas');
    snap.width = width;
    snap.height = height;
    const sctx = snap.getContext('2d');
    if (sctx) {
      sctx.drawImage(ctx.canvas, 0, 0);
      ctx.save();
      const filters: string[] = [];
      if (gBlur) filters.push(`blur(${Math.max(0.5, gBlur.radius * gBlur.intensity)}px)`);
      if (colorGrade) {
        const b = 100 + (colorGrade.brightness ?? 0);
        const c = 100 + (colorGrade.contrast ?? 0);
        const s = 100 + (colorGrade.saturation ?? 0);
        filters.push(`brightness(${b}%) contrast(${c}%) saturate(${s}%)`);
      }
      ctx.filter = filters.join(' ');
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(snap, 0, 0);
      ctx.restore();
    }
  }

  if (mBlur) {
    const snap = document.createElement('canvas');
    snap.width = width;
    snap.height = height;
    const sctx = snap.getContext('2d');
    if (sctx) {
      sctx.drawImage(ctx.canvas, 0, 0);
      ctx.save();
      ctx.globalAlpha = mBlur.intensity * 0.25;
      for (let i = 1; i <= 3; i++) {
        ctx.drawImage(snap, -i * (mBlur.radius * 0.4), 0);
      }
      ctx.restore();
    }
  }

  const animeGlow = enabled.find((e) => e.type === 'anime-glow');
  const lightBloom = enabled.find((e) => e.type === 'light-bloom');
  if (animeGlow || lightBloom) {
    const fx = animeGlow ?? lightBloom!;
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = width;
    glowCanvas.height = height;
    const gctx = glowCanvas.getContext('2d');
    if (gctx) {
      gctx.filter = `blur(${Math.max(4, fx.radius)}px)`;
      gctx.drawImage(ctx.canvas, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fx.intensity * 0.45;
      ctx.drawImage(glowCanvas, 0, 0);
      ctx.restore();
    }
  }

  const speedLines = enabled.find((e) => e.type === 'speed-lines');
  if (speedLines) {
    ctx.save();
    ctx.strokeStyle = speedLines.color ?? '#FFFFFF';
    ctx.globalAlpha = speedLines.intensity * 0.55;
    const cx = width / 2;
    const cy = height / 2;
    const count = 44;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (frame % 3) * 0.08;
      const rIn = Math.min(width, height) * (0.28 + ((i * 37) % 15) * 0.015);
      const rOut = Math.max(width, height) * 0.8;
      ctx.lineWidth = 1 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * rIn, cy + Math.sin(a) * rIn);
      ctx.lineTo(cx + Math.cos(a) * rOut, cy + Math.sin(a) * rOut);
      ctx.stroke();
    }
    ctx.restore();
  }

  const particles = enabled.find((e) => e.type === 'particles');
  if (particles) {
    ctx.save();
    ctx.fillStyle = particles.color ?? '#64D6C5';
    for (let i = 0; i < 28; i++) {
      const px = ((Math.sin(i * 17.3 + frame * 0.25) + 1) * 0.5) * width;
      const py = ((Math.cos(i * 23.1 - frame * 0.35) + 1) * 0.5) * height;
      const r = 1.5 + (i % 4) * 1.1;
      ctx.globalAlpha = particles.intensity * (0.3 + (i % 5) * 0.14);
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  const impactFlash = enabled.find((e) => e.type === 'impact-flash');
  if (impactFlash) {
    ctx.save();
    ctx.fillStyle = impactFlash.color ?? '#FFFFFF';
    ctx.globalAlpha = impactFlash.intensity * 0.35;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  const vignette = enabled.find((e) => e.type === 'vignette');
  if (vignette) {
    ctx.save();
    const grad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.25,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.72
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(9,10,13,${Math.min(0.85, vignette.intensity * 1.4)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

export interface RenderSceneOptions {
  frame: number;
  activeLayerId?: string;
  onionSkin?: OnionSkinConfig;
  guides?: GuideConfig;
  showRig?: boolean;
  selectedBoneId?: string | null;
  applyCamera?: boolean;
  applyEffects?: boolean;
  showGuides?: boolean;
  skipBackground?: boolean;
  liveStroke?: VectorStroke | null;
  onImageLoad?: () => void;
}

export function renderSceneToCanvas(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  options: RenderSceneOptions
): void {
  const { width, height } = scene;
  const {
    frame,
    activeLayerId,
    onionSkin,
    guides,
    showRig = false,
    selectedBoneId = null,
    applyCamera = true,
    applyEffects = true,
    showGuides = true,
    skipBackground = false,
    liveStroke = null,
    onImageLoad,
  } = options;

  ctx.clearRect(0, 0, width, height);

  if (!scene.transparentBg && !skipBackground) {
    ctx.fillStyle = scene.bgColor || '#1B1E26';
    ctx.fillRect(0, 0, width, height);
  }

  const cam = applyCamera
    ? resolveCameraAtFrame(scene.cameraKeyframes, frame)
    : { x: 0, y: 0, zoom: 1, rotation: 0, shakeOffsetX: 0, shakeOffsetY: 0 };

  const renderLayerWithContent = (
    targetCtx: CanvasRenderingContext2D,
    layer: Layer
  ) => {
    const cel = resolveCelAtFrame(layer, frame);
    const tf = resolveLayerTransformAtFrame(layer.keyframes, frame);

    targetCtx.save();
    targetCtx.globalAlpha = layer.opacity * tf.opacity;
    targetCtx.globalCompositeOperation = mapBlendMode(layer.blendMode);

    // Apply Camera + Multiplane Parallax + Layer Keyframe Transform
    targetCtx.translate(width / 2, height / 2);
    if (applyCamera) {
      targetCtx.scale(cam.zoom, cam.zoom);
      targetCtx.rotate((cam.rotation * Math.PI) / 180);
      targetCtx.translate(
        (-cam.x + cam.shakeOffsetX) * layer.parallaxDepth,
        (-cam.y + cam.shakeOffsetY) * layer.parallaxDepth
      );
    }
    targetCtx.translate(-width / 2, -height / 2);

    // Layer transform around center
    targetCtx.translate(width / 2 + tf.x, height / 2 + tf.y);
    targetCtx.rotate((tf.rotation * Math.PI) / 180);
    targetCtx.scale(tf.scaleX, tf.scaleY);
    targetCtx.translate(-width / 2, -height / 2);

    // Apply Skeletal Bone Binding transform if a bone is bound to this layer
    const boundBone = scene.rig.bones.find((b) => b.boundLayerId === layer.id);
    if (boundBone) {
      const worldBones = solveForwardKinematics(scene.rig.bones);
      const wb = worldBones[boundBone.id];
      if (wb) {
        targetCtx.translate(wb.startX, wb.startY);
        targetCtx.rotate(((wb.worldAngle + 90) * Math.PI) / 180);
        targetCtx.translate(-wb.startX, -wb.startY);
      }
    }

    // Onion skinning (only on active cel layer when editing)
    if (onionSkin?.enabled && layer.id === activeLayerId) {
      const { prev, next } = getOnionSkinNeighbors(
        layer,
        frame,
        onionSkin.prevFrames,
        onionSkin.nextFrames
      );
      for (const item of prev) {
        const alpha = onionSkin.opacity / item.distance;
        drawTintedCel(
          targetCtx,
          item.cel,
          width,
          height,
          onionSkin.prevColor,
          alpha,
          onImageLoad
        );
      }
      for (const item of next) {
        const alpha = onionSkin.opacity / item.distance;
        drawTintedCel(
          targetCtx,
          item.cel,
          width,
          height,
          onionSkin.nextColor,
          alpha,
          onImageLoad
        );
      }
    }

    if (cel) {
      drawCelContent(targetCtx, cel, onImageLoad);
    }
    if (liveStroke && layer.id === activeLayerId) {
      drawVectorStroke(targetCtx, liveStroke);
    }
    targetCtx.restore();
  };

  // Render layers in bottom-to-top order, supporting clipping masks
  for (let i = 0; i < scene.layers.length; i++) {
    const layer = scene.layers[i];
    if (!layer.visible) continue;

    // Check if subsequent layers clip to this base layer
    const clippedChildren: Layer[] = [];
    let j = i + 1;
    while (j < scene.layers.length && scene.layers[j].clippingMask) {
      if (scene.layers[j].visible) clippedChildren.push(scene.layers[j]);
      j++;
    }

    if (clippedChildren.length > 0) {
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = width;
      maskCanvas.height = height;
      const mctx = maskCanvas.getContext('2d');
      if (mctx) {
        renderLayerWithContent(mctx, layer);
        for (const child of clippedChildren) {
          mctx.save();
          mctx.globalCompositeOperation = 'source-atop';
          renderLayerWithContent(mctx, child);
          mctx.restore();
        }
        ctx.drawImage(maskCanvas, 0, 0);
      }
      i = j - 1;
    } else {
      renderLayerWithContent(ctx, layer);
    }
  }

  // Reference overlays (only in editor mode)
  if (showGuides) {
    for (const ref of scene.references) {
      if (!ref.visible) continue;
      const img = getCachedImage(ref.dataUrl, onImageLoad);
      if (img) {
        ctx.save();
        ctx.globalAlpha = ref.opacity;
        ctx.drawImage(img, ref.x, ref.y, ref.width, ref.height);
        ctx.restore();
      }
    }
  }

  if (applyEffects) {
    applyCompositingEffects(ctx, width, height, scene.effects, frame);
  }

  // Guides (Grid, Perspective, Safe Area, Symmetry)
  if (showGuides && guides) {
    ctx.save();
    if (guides.grid) {
      const step = Math.max(16, guides.gridSize);
      ctx.strokeStyle = 'rgba(156, 163, 175, 0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = step; x < width; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = step; y < height; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
    }

    if (guides.perspective) {
      const horizonY = height * 0.56;
      ctx.strokeStyle = 'rgba(100, 214, 197, 0.28)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(0, horizonY);
      ctx.lineTo(width, horizonY);
      for (let k = -4; k <= 4; k++) {
        ctx.moveTo(width * 0.15, horizonY);
        ctx.lineTo(width, horizonY + k * 140);
        ctx.moveTo(width * 0.85, horizonY);
        ctx.lineTo(0, horizonY + k * 140);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (guides.safeArea) {
      ctx.strokeStyle = 'rgba(139, 124, 255, 0.35)';
      ctx.lineWidth = 1.25;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(width * 0.05, height * 0.05, width * 0.9, height * 0.9);
      ctx.strokeStyle = 'rgba(100, 214, 197, 0.3)';
      ctx.strokeRect(width * 0.1, height * 0.1, width * 0.8, height * 0.8);
      ctx.setLineDash([]);
    }

    if (guides.symmetry !== 'none') {
      ctx.strokeStyle = 'rgba(139, 124, 255, 0.5)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      if (guides.symmetry === 'vertical' || guides.symmetry === 'quad') {
        ctx.moveTo(width / 2, 0);
        ctx.lineTo(width / 2, height);
      }
      if (guides.symmetry === 'horizontal' || guides.symmetry === 'quad') {
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
      }
      if (guides.symmetry === 'radial') {
        const count = Math.max(3, guides.radialSegments);
        const r = Math.max(width, height);
        for (let i = 0; i < count; i++) {
          const a = (i * Math.PI * 2) / count;
          ctx.moveTo(width / 2, height / 2);
          ctx.lineTo(width / 2 + Math.cos(a) * r, height / 2 + Math.sin(a) * r);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  // 2D Rig Skeleton Overlay
  if (showRig && scene.rig.bones.length > 0) {
    const world = solveForwardKinematics(scene.rig.bones);
    ctx.save();
    for (const bone of scene.rig.bones) {
      const wb = world[bone.id];
      if (!wb) continue;
      const isSelected = bone.id === selectedBoneId;

      ctx.strokeStyle = isSelected ? '#FFFFFF' : bone.color;
      ctx.lineWidth = isSelected ? 4 : 2.5;
      ctx.beginPath();
      ctx.moveTo(wb.startX, wb.startY);
      ctx.lineTo(wb.endX, wb.endY);
      ctx.stroke();

      // Bone diamond outline
      const angle = Math.atan2(wb.endY - wb.startY, wb.endX - wb.startX);
      const perp = angle + Math.PI / 2;
      const midX = wb.startX + (wb.endX - wb.startX) * 0.25;
      const midY = wb.startY + (wb.endY - wb.startY) * 0.25;
      const w = 6;
      ctx.fillStyle = isSelected ? 'rgba(139, 124, 255, 0.45)' : 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.moveTo(wb.startX, wb.startY);
      ctx.lineTo(midX + Math.cos(perp) * w, midY + Math.sin(perp) * w);
      ctx.lineTo(wb.endX, wb.endY);
      ctx.lineTo(midX - Math.cos(perp) * w, midY - Math.sin(perp) * w);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Joint pivot circle
      ctx.fillStyle = isSelected ? '#8B7CFF' : '#17191D';
      ctx.strokeStyle = bone.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(wb.startX, wb.startY, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function generateCelThumbnail(cel: CelFrame, sceneWidth: number, sceneHeight: number): string {
  if (typeof document === 'undefined') return '';
  const thumbW = 96;
  const thumbH = 54;
  const c = document.createElement('canvas');
  c.width = thumbW;
  c.height = thumbH;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#1B1E26';
  ctx.fillRect(0, 0, thumbW, thumbH);
  ctx.save();
  ctx.scale(thumbW / sceneWidth, thumbH / sceneHeight);
  drawCelContent(ctx, cel);
  ctx.restore();
  return c.toDataURL('image/png');
}
