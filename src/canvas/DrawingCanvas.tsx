import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Eye,
  FlipHorizontal2,
  Hand,
  Magnet,
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { getSymmetricPoints, solveForwardKinematics, stabilizePoints } from '../engine/math';
import { resolveCelAtFrame } from '../engine/timeline';
import type {
  BrushPreset,
  GuideConfig,
  Layer,
  OnionSkinConfig,
  Scene,
  StrokePoint,
  ToolId,
  VectorStroke,
} from '../engine/types';
import { drawCelContent, getCachedImage, renderSceneToCanvas } from './renderer';

interface DrawingCanvasProps {
  scene: Scene;
  currentFrame: number;
  activeLayer: Layer | undefined;
  activeTool: ToolId;
  activeColor: string;
  brushPreset: BrushPreset;
  shapeFill: boolean;
  onionSkin: OnionSkinConfig;
  guides: GuideConfig;
  cameraPreviewMode: boolean;
  showRigOverlay: boolean;
  rigEditMode: boolean;
  selectedBoneId: string | null;
  palmRejection: boolean;
  zoom: number;
  pan: { x: number; y: number };
  rotationDeg: number;
  onZoomChange: (z: number) => void;
  onPanChange: (p: { x: number; y: number }) => void;
  onRotationChange: (deg: number) => void;
  onToggleShapeFill: () => void;
  onCommitStrokes: (strokes: VectorStroke[]) => void;
  onUpdateCelRaster: (rasterDataUrl: string) => void;
  onReplaceCelStrokes: (strokes: VectorStroke[]) => void;
  onCommitTransformStrokes: (strokes: VectorStroke[]) => void;
  onTransformStart: () => void;
  onTransformEnd: () => void;
  onClearActiveCel: () => void;
  onPickColor: (hex: string) => void;
  onSelectBone: (boneId: string | null) => void;
  onUpdateBoneAngle: (boneId: string, angle: number, rootPos?: { x: number; y: number }) => void;
  onToggleCameraPreview: () => void;
}

function hexToRgba(hex: string): [number, number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0');
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
      .join('')
  );
}

function pointInPolygon(x: number, y: number, poly: StrokePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function floodFillCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  startX: number,
  startY: number,
  fillHex: string,
  tolerance = 36
): boolean {
  const sx = Math.floor(startX);
  const sy = Math.floor(startY);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return false;

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const idx0 = (sy * width + sx) * 4;
  const targetR = data[idx0];
  const targetG = data[idx0 + 1];
  const targetB = data[idx0 + 2];
  const targetA = data[idx0 + 3];

  const [fillR, fillG, fillB, fillA] = hexToRgba(fillHex);
  if (
    Math.abs(targetR - fillR) < 4 &&
    Math.abs(targetG - fillG) < 4 &&
    Math.abs(targetB - fillB) < 4 &&
    Math.abs(targetA - fillA) < 4
  ) {
    return false;
  }

  const matches = (pos: number) => {
    return (
      Math.abs(data[pos] - targetR) <= tolerance &&
      Math.abs(data[pos + 1] - targetG) <= tolerance &&
      Math.abs(data[pos + 2] - targetB) <= tolerance &&
      Math.abs(data[pos + 3] - targetA) <= tolerance
    );
  };

  const visited = new Uint8Array(width * height);
  const stack: number[] = [sx, sy];

  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    const pIdx = y * width + x;
    if (visited[pIdx]) continue;
    const off = pIdx * 4;
    if (!matches(off)) continue;

    visited[pIdx] = 1;
    data[off] = fillR;
    data[off + 1] = fillG;
    data[off + 2] = fillB;
    data[off + 3] = fillA;

    if (x > 0) stack.push(x - 1, y);
    if (x < width - 1) stack.push(x + 1, y);
    if (y > 0) stack.push(x, y - 1);
    if (y < height - 1) stack.push(x, y + 1);
  }

  ctx.putImageData(imgData, 0, 0);
  return true;
}

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  scene,
  currentFrame,
  activeLayer,
  activeTool,
  activeColor,
  brushPreset,
  shapeFill,
  onionSkin,
  guides,
  cameraPreviewMode,
  showRigOverlay,
  rigEditMode,
  selectedBoneId,
  palmRejection,
  zoom,
  pan,
  rotationDeg,
  onZoomChange,
  onPanChange,
  onRotationChange,
  onToggleShapeFill,
  onCommitStrokes,
  onUpdateCelRaster,
  onReplaceCelStrokes,
  onCommitTransformStrokes,
  onTransformStart,
  onTransformEnd,
  onClearActiveCel,
  onPickColor,
  onSelectBone,
  onUpdateBoneAngle,
  onToggleCameraPreview,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activePointsRef = useRef<StrokePoint[]>([]);
  const isDrawingRef = useRef(false);
  const hasPenInputRef = useRef(false);
  const panStartRef = useRef<{ clientX: number; clientY: number; panX: number; panY: number } | null>(null);
  const transformDragRef = useRef<{
    lastX: number;
    lastY: number;
    totalDx: number;
    totalDy: number;
    moved: boolean;
    hasRaster: boolean;
    rasterDataUrl?: string;
  } | null>(null);
  const boneDragRef = useRef<{ boneId: string; startX: number; startY: number } | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);

  const [liveStroke, setLiveStroke] = useState<VectorStroke | null>(null);
  const [lassoPoints, setLassoPoints] = useState<StrokePoint[]>([]);
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<string[]>([]);
  const [zoomOutMode, setZoomOutMode] = useState(false);
  const [textInputPos, setTextInputPos] = useState<{ x: number; y: number } | null>(null);
  const [textDraft, setTextDraft] = useState('');
  const [renderTick, setRenderTick] = useState(0);

  // Accurate screen -> canvas projection accounting for CSS pan, zoom, and canvas rotation
  const screenToCanvas = useCallback(
    (clientX: number, clientY: number): StrokePoint => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0, pressure: 0.65 };
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;

      const rad = (-rotationDeg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const ux = dx * cos - dy * sin;
      const uy = dx * sin + dy * cos;

      const cssWidth = Math.max(1, canvas.offsetWidth * zoom);
      const cssHeight = Math.max(1, canvas.offsetHeight * zoom);
      const x = (ux / cssWidth + 0.5) * scene.width;
      const y = (uy / cssHeight + 0.5) * scene.height;
      return { x, y, pressure: 0.65 };
    },
    [scene.width, scene.height, rotationDeg, zoom]
  );

  // Clear stale selection if switching layers or frames
  useEffect(() => {
    setSelectedStrokeIds([]);
  }, [activeLayer?.id, currentFrame]);

  // Main render pass
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    renderSceneToCanvas(ctx, scene, {
      frame: currentFrame,
      activeLayerId: activeLayer?.id,
      onionSkin: cameraPreviewMode ? undefined : onionSkin,
      guides,
      showRig: showRigOverlay && !cameraPreviewMode,
      selectedBoneId,
      applyCamera: cameraPreviewMode || scene.cameraKeyframes.length > 0,
      applyEffects: true,
      showGuides: !cameraPreviewMode,
      liveStroke,
      onImageLoad: () => setRenderTick((t) => t + 1),
    });

    // Draw lasso / selection highlight overlay
    if (!cameraPreviewMode && (lassoPoints.length > 1 || selectedStrokeIds.length > 0)) {
      ctx.save();
      if (lassoPoints.length > 1) {
        ctx.strokeStyle = '#64D6C5';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
        for (let i = 1; i < lassoPoints.length; i++) {
          ctx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
        }
        ctx.stroke();
      }
      if (selectedStrokeIds.length > 0 && activeLayer) {
        const cel = resolveCelAtFrame(activeLayer, currentFrame);
        if (cel) {
          let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
          for (const st of cel.strokes) {
            if (!selectedStrokeIds.includes(st.id)) continue;
            for (const p of st.points) {
              minX = Math.min(minX, p.x);
              minY = Math.min(minY, p.y);
              maxX = Math.max(maxX, p.x);
              maxY = Math.max(maxY, p.y);
            }
          }
          if (isFinite(minX)) {
            ctx.strokeStyle = '#8B7CFF';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 4]);
            ctx.strokeRect(minX - 10, minY - 10, maxX - minX + 20, maxY - minY + 20);
          }
        }
      }
      ctx.restore();
    }
  }, [
    scene,
    currentFrame,
    activeLayer,
    onionSkin,
    guides,
    cameraPreviewMode,
    showRigOverlay,
    selectedBoneId,
    liveStroke,
    lassoPoints,
    selectedStrokeIds,
    renderTick,
  ]);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = -e.deltaY * 0.002;
      onZoomChange(Math.max(0.2, Math.min(4, Number((zoom + delta).toFixed(2)))));
    } else {
      onPanChange({
        x: pan.x - e.deltaX * 0.7,
        y: pan.y - e.deltaY * 0.7,
      });
    }
  };

  const applyTransformToCel = (
    transformType: 'scale-up' | 'scale-down' | 'rot-ccw' | 'rot-cw' | 'flip-h' | 'delete'
  ) => {
    if (!activeLayer || activeLayer.locked) return;
    const cel = resolveCelAtFrame(activeLayer, currentFrame);
    if (!cel) return;

    if (cel.strokes.length === 0) {
      if (transformType === 'delete') onClearActiveCel();
      return;
    }

    const targetIds =
      selectedStrokeIds.length > 0
        ? new Set(selectedStrokeIds)
        : new Set(cel.strokes.map((s) => s.id));

    if (transformType === 'delete') {
      const remaining = cel.strokes.filter((s) => !targetIds.has(s.id));
      onCommitTransformStrokes(remaining);
      setSelectedStrokeIds([]);
      return;
    }

    // Compute bounding center of target strokes
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const s of cel.strokes) {
      if (!targetIds.has(s.id)) continue;
      for (const p of s.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    }
    if (!isFinite(minX)) return;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const nextStrokes = cel.strokes.map((s) => {
      if (!targetIds.has(s.id)) return s;
      const pts = s.points.map((p) => {
        const dx = p.x - cx;
        const dy = p.y - cy;
        if (transformType === 'scale-up') {
          return { ...p, x: cx + dx * 1.12, y: cy + dy * 1.12 };
        }
        if (transformType === 'scale-down') {
          return { ...p, x: cx + dx * 0.89, y: cy + dy * 0.89 };
        }
        if (transformType === 'flip-h') {
          return { ...p, x: cx - dx };
        }
        const angleRad = ((transformType === 'rot-cw' ? 15 : -15) * Math.PI) / 180;
        const cos = Math.cos(angleRad);
        const sin = Math.sin(angleRad);
        return {
          ...p,
          x: cx + dx * cos - dy * sin,
          y: cy + dx * sin + dy * cos,
        };
      });
      return { ...s, points: pts };
    });

    onCommitTransformStrokes(nextStrokes);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'pen') {
      hasPenInputRef.current = true;
    }

    // Only reject stray single-finger palm touches if a stylus/pen has been detected
    if (palmRejection && hasPenInputRef.current && e.pointerType === 'touch' && !rigEditMode) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointersRef.current.size < 2) return;
    }

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchRef.current = { dist, zoom };
      isDrawingRef.current = false;
      setLiveStroke(null);
      return;
    }

    try {
      (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointerId cannot be captured (e.g., synthetic or transient pointer)
    }
    const pt = screenToCanvas(e.clientX, e.clientY);
    const rawPressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.72;
    pt.pressure = brushPreset.pressureSize ? rawPressure : 0.765;

    // Rig bone dragging priority when rig edit mode is active
    if (rigEditMode && showRigOverlay && scene.rig.bones.length > 0) {
      const world = solveForwardKinematics(scene.rig.bones);
      let nearestId: string | null = null;
      let nearestDist = 30;
      for (const bone of scene.rig.bones) {
        const wb = world[bone.id];
        if (!wb) continue;
        const dEnd = Math.hypot(wb.endX - pt.x, wb.endY - pt.y);
        const dStart = Math.hypot(wb.startX - pt.x, wb.startY - pt.y);
        const d = Math.min(dEnd, dStart);
        if (d < nearestDist) {
          nearestDist = d;
          nearestId = bone.id;
        }
      }
      if (nearestId) {
        onSelectBone(nearestId);
        boneDragRef.current = { boneId: nearestId, startX: pt.x, startY: pt.y };
        return;
      }
    }

    if (activeTool === 'hand' || e.button === 1) {
      panStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
      return;
    }

    if (activeTool === 'zoom') {
      const zoomOut = zoomOutMode || e.altKey;
      const factor = zoomOut ? -0.25 : 0.25;
      onZoomChange(Math.max(0.2, Math.min(4, Number((zoom + factor).toFixed(2)))));
      return;
    }

    if (activeTool === 'eyedropper') {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        const px = Math.max(0, Math.min(scene.width - 1, Math.floor(pt.x)));
        const py = Math.max(0, Math.min(scene.height - 1, Math.floor(pt.y)));
        const d = ctx.getImageData(px, py, 1, 1).data;
        onPickColor(rgbToHex(d[0], d[1], d[2]));
      }
      return;
    }

    if (!activeLayer || activeLayer.locked) return;

    if (activeTool === 'text') {
      setTextInputPos({ x: pt.x, y: pt.y });
      setTextDraft('');
      return;
    }

    if (activeTool === 'fill') {
      const cel = resolveCelAtFrame(activeLayer, currentFrame);
      const off = document.createElement('canvas');
      off.width = scene.width;
      off.height = scene.height;
      const octx = off.getContext('2d');
      if (!octx) return;
      if (cel) {
        drawCelContent(octx, cel);
      }
      const changed = floodFillCanvas(octx, scene.width, scene.height, pt.x, pt.y, activeColor);
      if (changed) {
        onUpdateCelRaster(off.toDataURL('image/png'));
      }
      return;
    }

    if (activeTool === 'lasso') {
      isDrawingRef.current = true;
      setLassoPoints([pt]);
      return;
    }

    if (activeTool === 'transform') {
      const cel = resolveCelAtFrame(activeLayer, currentFrame);
      onTransformStart();
      transformDragRef.current = {
        lastX: pt.x,
        lastY: pt.y,
        totalDx: 0,
        totalDy: 0,
        moved: false,
        hasRaster: Boolean(cel?.rasterDataUrl && cel.strokes.length === 0),
        rasterDataUrl: cel?.rasterDataUrl,
      };
      return;
    }

    // Drawing or Shape tools
    isDrawingRef.current = true;
    activePointsRef.current = [pt];
    const strokeTool =
      activeTool === 'pencil' ||
      activeTool === 'brush' ||
      activeTool === 'pen' ||
      activeTool === 'eraser' ||
      activeTool === 'line' ||
      activeTool === 'rect' ||
      activeTool === 'ellipse'
        ? activeTool
        : 'pen';

    const effectiveOpacity = brushPreset.pressureOpacity
      ? Math.max(0.15, brushPreset.opacity * (0.65 + pt.pressure * 0.4))
      : brushPreset.opacity;

    setLiveStroke({
      id: `live-${Date.now()}`,
      points: [pt],
      color: activeColor,
      size: brushPreset.size,
      opacity: Math.min(1, effectiveOpacity),
      hardness: brushPreset.hardness,
      texture: brushPreset.texture,
      tool: strokeTool,
      fill: strokeTool === 'rect' || strokeTool === 'ellipse' ? shapeFill : undefined,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (activePointersRef.current.size === 2 && pinchRef.current) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const ratio = dist / Math.max(1, pinchRef.current.dist);
      onZoomChange(Math.max(0.2, Math.min(4, Number((pinchRef.current.zoom * ratio).toFixed(2)))));
      return;
    }

    const pt = screenToCanvas(e.clientX, e.clientY);

    if (boneDragRef.current) {
      const bone = scene.rig.bones.find((b) => b.id === boneDragRef.current!.boneId);
      if (bone) {
        const world = solveForwardKinematics(scene.rig.bones);
        const wb = world[bone.id];
        if (wb) {
          if (!bone.parentId && Math.hypot(pt.x - wb.startX, pt.y - wb.startY) < 20) {
            onUpdateBoneAngle(bone.id, bone.angle, { x: pt.x, y: pt.y });
          } else {
            const parentAngle =
              bone.parentId && world[bone.parentId] ? world[bone.parentId].worldAngle : 0;
            const targetWorldDeg =
              (Math.atan2(pt.y - wb.startY, pt.x - wb.startX) * 180) / Math.PI;
            onUpdateBoneAngle(bone.id, targetWorldDeg - parentAngle);
          }
        }
      }
      return;
    }

    if (panStartRef.current) {
      onPanChange({
        x: panStartRef.current.panX + (e.clientX - panStartRef.current.clientX),
        y: panStartRef.current.panY + (e.clientY - panStartRef.current.clientY),
      });
      return;
    }

    if (transformDragRef.current && activeLayer) {
      const dx = pt.x - transformDragRef.current.lastX;
      const dy = pt.y - transformDragRef.current.lastY;
      transformDragRef.current.lastX = pt.x;
      transformDragRef.current.lastY = pt.y;
      transformDragRef.current.totalDx += dx;
      transformDragRef.current.totalDy += dy;
      if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
        transformDragRef.current.moved = true;
      }

      const cel = resolveCelAtFrame(activeLayer, currentFrame);
      if (cel && cel.strokes.length > 0) {
        const targetIds =
          selectedStrokeIds.length > 0
            ? new Set(selectedStrokeIds)
            : new Set(cel.strokes.map((s) => s.id));
        const moved = cel.strokes.map((s) =>
          targetIds.has(s.id)
            ? { ...s, points: s.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) }
            : s
        );
        onReplaceCelStrokes(moved);
      }
      return;
    }

    if (!isDrawingRef.current) return;

    if (activeTool === 'lasso') {
      setLassoPoints((prev) => [...prev, pt]);
      return;
    }

    const rawPressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.72;
    pt.pressure = brushPreset.pressureSize ? rawPressure : 0.765;

    if (activeTool === 'line' || activeTool === 'rect' || activeTool === 'ellipse') {
      const start = activePointsRef.current[0];
      activePointsRef.current = [start, pt];
    } else {
      activePointsRef.current.push(pt);
    }

    setLiveStroke((prev) =>
      prev
        ? {
            ...prev,
            points:
              activeTool === 'line' || activeTool === 'rect' || activeTool === 'ellipse'
                ? [...activePointsRef.current]
                : stabilizePoints(activePointsRef.current, brushPreset.stabilization),
          }
        : null
    );
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
      pinchRef.current = null;
    }
    boneDragRef.current = null;
    panStartRef.current = null;

    if (transformDragRef.current) {
      const td = transformDragRef.current;
      transformDragRef.current = null;
      if (td.moved && td.hasRaster && td.rasterDataUrl) {
        const img = getCachedImage(td.rasterDataUrl);
        if (img) {
          const off = document.createElement('canvas');
          off.width = scene.width;
          off.height = scene.height;
          const octx = off.getContext('2d');
          if (octx) {
            octx.drawImage(img, td.totalDx, td.totalDy);
            onUpdateCelRaster(off.toDataURL('image/png'));
          }
        }
      }
      if (td.moved) {
        onTransformEnd();
      }
    }

    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (activeTool === 'lasso') {
      if (activeLayer && lassoPoints.length > 2) {
        const cel = resolveCelAtFrame(activeLayer, currentFrame);
        if (cel) {
          const matched = cel.strokes
            .filter((s) => s.points.some((p) => pointInPolygon(p.x, p.y, lassoPoints)))
            .map((s) => s.id);
          setSelectedStrokeIds(matched);
        }
      }
      setLassoPoints([]);
      return;
    }

    if (liveStroke && liveStroke.points.length > 0) {
      const stabilized =
        liveStroke.tool === 'line' || liveStroke.tool === 'rect' || liveStroke.tool === 'ellipse'
          ? liveStroke.points
          : stabilizePoints(activePointsRef.current, brushPreset.stabilization);

      // Apply symmetry mirroring cleanly
      if (guides.symmetry !== 'none') {
        const branches: StrokePoint[][] = [];
        for (const p of stabilized) {
          const sym = getSymmetricPoints(
            p,
            scene.width,
            scene.height,
            guides.symmetry,
            guides.radialSegments
          );
          sym.forEach((sp, idx) => {
            if (!branches[idx]) branches[idx] = [];
            branches[idx].push(sp);
          });
        }
        const committed: VectorStroke[] = branches.map((pts, idx) => ({
          ...liveStroke,
          id: `st-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          points: pts,
        }));
        onCommitStrokes(committed);
      } else {
        onCommitStrokes([
          {
            ...liveStroke,
            id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            points: stabilized,
          },
        ]);
      }
    }

    activePointsRef.current = [];
    setLiveStroke(null);
  };

  const commitText = () => {
    if (textInputPos && textDraft.trim()) {
      onCommitStrokes([
        {
          id: `txt-${Date.now()}`,
          tool: 'text',
          color: activeColor,
          size: Math.max(6, brushPreset.size),
          opacity: brushPreset.opacity,
          hardness: 1,
          texture: 'smooth',
          points: [{ x: textInputPos.x, y: textInputPos.y, pressure: 1 }],
          text: textDraft.trim(),
        },
      ]);
    }
    setTextInputPos(null);
    setTextDraft('');
  };

  const cursorClass =
    activeTool === 'hand'
      ? 'cursor-grab active:cursor-grabbing'
      : activeTool === 'zoom'
      ? zoomOutMode
        ? 'cursor-zoom-out'
        : 'cursor-zoom-in'
      : activeTool === 'transform'
      ? 'cursor-move'
      : 'cursor-crosshair';

  const showTransformBar =
    activeTool === 'transform' ||
    activeTool === 'lasso' ||
    selectedStrokeIds.length > 0;

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      className="relative flex-1 h-full overflow-hidden bg-[#121418] select-none flex items-center justify-center"
      style={{ backgroundColor: 'var(--studio-bg)' }}
    >
      {/* Floating Contextual Bar (Transform / Shape Fill / Zoom Mode) */}
      {(showTransformBar || activeTool === 'rect' || activeTool === 'ellipse' || activeTool === 'zoom') && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--studio-panel)]/95 border border-[var(--studio-border)] shadow-lg text-[11px] backdrop-blur-sm max-w-[92%] overflow-x-auto">
          {(activeTool === 'rect' || activeTool === 'ellipse') && (
            <button
              type="button"
              onClick={onToggleShapeFill}
              className={`px-2 py-0.5 rounded font-medium whitespace-nowrap ${
                shapeFill
                  ? 'bg-[#8B7CFF] text-white'
                  : 'text-[var(--studio-text-muted)] hover:text-[var(--studio-text)]'
              }`}
            >
              {shapeFill ? 'Shape: Filled' : 'Shape: Outline'}
            </button>
          )}

          {activeTool === 'zoom' && (
            <>
              <button
                type="button"
                onClick={() => setZoomOutMode(false)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded font-medium ${
                  !zoomOutMode ? 'bg-[#8B7CFF] text-white' : 'text-[var(--studio-text-muted)]'
                }`}
              >
                <ZoomIn className="w-3 h-3" /> Zoom In
              </button>
              <button
                type="button"
                onClick={() => setZoomOutMode(true)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded font-medium ${
                  zoomOutMode ? 'bg-[#8B7CFF] text-white' : 'text-[var(--studio-text-muted)]'
                }`}
              >
                <ZoomOut className="w-3 h-3" /> Zoom Out
              </button>
            </>
          )}

          {showTransformBar && (
            <>
              <span className="text-[var(--studio-text-muted)] px-1 whitespace-nowrap">
                {selectedStrokeIds.length > 0
                  ? `${selectedStrokeIds.length} sel`
                  : 'Cel'}
              </span>
              <button
                type="button"
                onClick={() => applyTransformToCel('scale-up')}
                title="Scale Up +12%"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[var(--studio-border)]/50"
              >
                <Maximize2 className="w-3 h-3" /> +
              </button>
              <button
                type="button"
                onClick={() => applyTransformToCel('scale-down')}
                title="Scale Down -11%"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[var(--studio-border)]/50"
              >
                <Minimize2 className="w-3 h-3" /> -
              </button>
              <button
                type="button"
                onClick={() => applyTransformToCel('rot-ccw')}
                title="Rotate -15°"
                className="p-1 rounded hover:bg-[var(--studio-border)]/50"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => applyTransformToCel('rot-cw')}
                title="Rotate +15°"
                className="p-1 rounded hover:bg-[var(--studio-border)]/50"
              >
                <RotateCw className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => applyTransformToCel('flip-h')}
                title="Flip Horizontal"
                className="p-1 rounded hover:bg-[var(--studio-border)]/50"
              >
                <FlipHorizontal2 className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => applyTransformToCel('delete')}
                title={selectedStrokeIds.length > 0 ? 'Delete Selected' : 'Clear Cel'}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-rose-400 hover:bg-rose-500/15 whitespace-nowrap"
              >
                <Trash2 className="w-3 h-3" />
                {selectedStrokeIds.length > 0 ? 'Delete' : 'Clear'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Transformed Canvas Stage */}
      <div
        className="relative shadow-2xl border border-[#343943]/80 transition-transform duration-75"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotationDeg}deg)`,
          transformOrigin: 'center center',
        }}
      >
        <div
          className={`relative ${scene.transparentBg ? 'canvas-checkerboard' : ''}`}
          style={{
            width: 'min(72vw, 920px)',
            aspectRatio: `${scene.width} / ${scene.height}`,
          }}
        >
          <canvas
            ref={canvasRef}
            data-testid="animation-canvas"
            width={scene.width}
            height={scene.height}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className={`w-full h-full block touch-none ${cursorClass}`}
          />

          {/* Floating Text Tool Input */}
          {textInputPos && (
            <div
              className="absolute z-20 flex items-center gap-1 bg-[#252930] border border-[#8B7CFF] rounded px-2 py-1 shadow-lg"
              style={{
                left: `${(textInputPos.x / scene.width) * 100}%`,
                top: `${(textInputPos.y / scene.height) * 100}%`,
              }}
            >
              <input
                autoFocus
                type="text"
                value={textDraft}
                onChange={(e) => setTextDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitText();
                  if (e.key === 'Escape') setTextInputPos(null);
                }}
                placeholder="Type text..."
                className="bg-transparent text-xs text-white outline-none w-32"
              />
              <button
                type="button"
                onClick={commitText}
                className="px-1.5 py-0.5 text-[11px] bg-[#8B7CFF] text-white rounded"
              >
                Add
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Compact Canvas Viewport Overlay Controls (Bottom-Left of stage, non-obtrusive) */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[var(--studio-panel)]/90 border border-[var(--studio-border)] text-xs backdrop-blur-sm">
        <span className="font-mono tabular-nums text-[11px] text-[var(--studio-text-muted)]">
          {scene.width}×{scene.height}
        </span>
        <span className="text-[var(--studio-border)]">|</span>
        <button
          type="button"
          onClick={onToggleCameraPreview}
          aria-label="Toggle Camera Preview"
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
            cameraPreviewMode
              ? 'bg-[#64D6C5]/20 text-[#64D6C5]'
              : 'text-[var(--studio-text-muted)] hover:text-[var(--studio-text)]'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          {cameraPreviewMode ? 'Camera View' : 'Stage View'}
        </button>
        <button
          type="button"
          onClick={() => onZoomChange(Math.max(0.2, Number((zoom - 0.15).toFixed(2))))}
          aria-label="Zoom Out Canvas"
          className="p-0.5 rounded text-[var(--studio-text-muted)] hover:text-[var(--studio-text)]"
        >
          <ZoomOut className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => {
            onZoomChange(1);
            onPanChange({ x: 0, y: 0 });
            onRotationChange(0);
          }}
          aria-label="Reset Canvas View"
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-[var(--studio-text-muted)] hover:text-[var(--studio-text)] whitespace-nowrap font-mono tabular-nums"
          title="Reset Zoom, Pan & Rotation"
        >
          <RotateCcw className="w-3 h-3" />
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={() => onZoomChange(Math.min(4, Number((zoom + 0.15).toFixed(2))))}
          aria-label="Zoom In Canvas"
          className="p-0.5 rounded text-[var(--studio-text-muted)] hover:text-[var(--studio-text)]"
        >
          <ZoomIn className="w-3 h-3" />
        </button>
        {rotationDeg !== 0 && (
          <span className="font-mono tabular-nums text-[11px] text-[#8B7CFF]">
            {rotationDeg}°
          </span>
        )}
        {activeLayer?.locked && (
          <span className="flex items-center gap-1 text-[11px] text-amber-400">
            <Hand className="w-3 h-3" /> Locked
          </span>
        )}
        {selectedStrokeIds.length > 0 && (
          <button
            type="button"
            onClick={() => setSelectedStrokeIds([])}
            className="flex items-center gap-1 text-[11px] text-[#8B7CFF] hover:underline"
          >
            <Magnet className="w-3 h-3" /> Clear Sel ({selectedStrokeIds.length})
          </button>
        )}
      </div>
    </div>
  );
};
