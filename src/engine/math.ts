import type {
  Bone,
  CameraKeyframe,
  EasingType,
  StrokePoint,
  SymmetryMode,
} from './types';

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Evaluate cubic bezier y(t) for CSS-style control points [x1, y1, x2, y2].
 */
export function evaluateCubicBezier(
  t: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number
): number {
  const u = clamp(t, 0, 1);
  // Newton-Raphson solve for x(s) = u
  let s = u;
  for (let i = 0; i < 6; i++) {
    const x =
      3 * (1 - s) * (1 - s) * s * p1x +
      3 * (1 - s) * s * s * p2x +
      s * s * s;
    const dx =
      3 * (1 - s) * (1 - s) * p1x +
      6 * (1 - s) * s * (p2x - p1x) +
      3 * s * s * (1 - p2x);
    if (Math.abs(dx) < 1e-6) break;
    s = clamp(s - (x - u) / dx, 0, 1);
  }
  return (
    3 * (1 - s) * (1 - s) * s * p1y +
    3 * (1 - s) * s * s * p2y +
    s * s * s
  );
}

export function applyEasing(
  t: number,
  easing: EasingType,
  bezier?: [number, number, number, number]
): number {
  const u = clamp(t, 0, 1);
  switch (easing) {
    case 'linear':
      return u;
    case 'ease-in':
      return u * u * u;
    case 'ease-out':
      return 1 - Math.pow(1 - u, 3);
    case 'ease-in-out':
      return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    case 'bezier': {
      const [x1, y1, x2, y2] = bezier ?? [0.25, 0.1, 0.25, 1];
      return evaluateCubicBezier(u, x1, y1, x2, y2);
    }
    default:
      return u;
  }
}

/**
 * Exponential moving-average stroke stabilization.
 * stabilizationLevel: 0 (raw) to 10 (heavy smoothing).
 */
export function stabilizePoints(
  points: StrokePoint[],
  stabilizationLevel: number
): StrokePoint[] {
  if (points.length <= 2 || stabilizationLevel <= 0) return points;
  const alpha = clamp(1 - stabilizationLevel * 0.082, 0.12, 1);
  const result: StrokePoint[] = [{ ...points[0] }];
  for (let i = 1; i < points.length; i++) {
    const prev = result[i - 1];
    const curr = points[i];
    // Preserve endpoint sharpness on final point
    const factor = i === points.length - 1 ? Math.max(alpha, 0.65) : alpha;
    result.push({
      x: lerp(prev.x, curr.x, factor),
      y: lerp(prev.y, curr.y, factor),
      pressure: lerp(prev.pressure, curr.pressure, 0.5),
      t: curr.t,
    });
  }
  return result;
}

/**
 * Generate symmetric mirror points relative to canvas center.
 */
export function getSymmetricPoints(
  point: StrokePoint,
  canvasWidth: number,
  canvasHeight: number,
  mode: SymmetryMode,
  radialSegments = 6
): StrokePoint[] {
  if (mode === 'none') return [point];
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;
  const dx = point.x - cx;
  const dy = point.y - cy;

  if (mode === 'vertical') {
    return [point, { ...point, x: cx - dx }];
  }
  if (mode === 'horizontal') {
    return [point, { ...point, y: cy - dy }];
  }
  if (mode === 'quad') {
    return [
      point,
      { ...point, x: cx - dx },
      { ...point, y: cy - dy },
      { ...point, x: cx - dx, y: cy - dy },
    ];
  }
  if (mode === 'radial') {
    const count = clamp(Math.round(radialSegments), 3, 16);
    const out: StrokePoint[] = [];
    const r = Math.hypot(dx, dy);
    const baseAngle = Math.atan2(dy, dx);
    for (let i = 0; i < count; i++) {
      const a = baseAngle + (i * Math.PI * 2) / count;
      out.push({
        ...point,
        x: cx + Math.cos(a) * r,
        y: cy + Math.sin(a) * r,
      });
    }
    return out;
  }
  return [point];
}

export interface WorldBoneTransform {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  worldAngle: number; // degrees
}

/**
 * Forward Kinematics: resolves world start/end coordinates for all bones in hierarchy.
 */
export function solveForwardKinematics(
  bones: Bone[]
): Record<string, WorldBoneTransform> {
  const byId = new Map<string, Bone>();
  bones.forEach((b) => byId.set(b.id, b));
  const resolved: Record<string, WorldBoneTransform> = {};

  const resolveOne = (bone: Bone, visited = new Set<string>()): WorldBoneTransform => {
    if (resolved[bone.id]) return resolved[bone.id];
    if (visited.has(bone.id)) {
      return {
        id: bone.id,
        startX: bone.x,
        startY: bone.y,
        endX: bone.x + bone.length,
        endY: bone.y,
        worldAngle: bone.angle,
      };
    }
    visited.add(bone.id);

    let startX = bone.x;
    let startY = bone.y;
    let worldAngle = bone.angle;

    if (bone.parentId && byId.has(bone.parentId)) {
      const parent = resolveOne(byId.get(bone.parentId)!, visited);
      startX = parent.endX;
      startY = parent.endY;
      worldAngle = parent.worldAngle + bone.angle;
    }

    const rad = (worldAngle * Math.PI) / 180;
    const endX = startX + Math.cos(rad) * bone.length;
    const endY = startY + Math.sin(rad) * bone.length;

    resolved[bone.id] = {
      id: bone.id,
      startX,
      startY,
      endX,
      endY,
      worldAngle,
    };
    return resolved[bone.id];
  };

  for (const b of bones) {
    resolveOne(b);
  }
  return resolved;
}

/**
 * 2-bone analytic Inverse Kinematics solver (law of cosines).
 * Returns updated local angles (in degrees) for upper and lower bones to reach (targetX, targetY).
 */
export function solveTwoBoneIK(
  rootX: number,
  rootY: number,
  parentWorldAngle: number,
  len1: number,
  len2: number,
  targetX: number,
  targetY: number,
  bendDirection: 1 | -1 = 1
): { angle1Local: number; angle2Local: number } {
  const dx = targetX - rootX;
  const dy = targetY - rootY;
  const dist = clamp(Math.hypot(dx, dy), Math.abs(len1 - len2) + 0.001, len1 + len2 - 0.001);

  const targetAngle = Math.atan2(dy, dx);
  const cosA1 = clamp(
    (len1 * len1 + dist * dist - len2 * len2) / (2 * len1 * dist),
    -1,
    1
  );
  const cosA2 = clamp(
    (len1 * len1 + len2 * len2 - dist * dist) / (2 * len1 * len2),
    -1,
    1
  );

  const a1 = Math.acos(cosA1);
  const worldAngle1 = targetAngle - bendDirection * a1;
  const interiorAngle2 = Math.acos(cosA2);
  const localAngle2Rad = bendDirection * (Math.PI - interiorAngle2);

  const worldDeg1 = (worldAngle1 * 180) / Math.PI;
  const localDeg1 = worldDeg1 - parentWorldAngle;
  const localDeg2 = (localAngle2Rad * 180) / Math.PI;

  return {
    angle1Local: localDeg1,
    angle2Local: localDeg2,
  };
}

export interface ResolvedCamera {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  shakeOffsetX: number;
  shakeOffsetY: number;
}

export function resolveCameraAtFrame(
  keyframes: CameraKeyframe[],
  frame: number
): ResolvedCamera {
  if (keyframes.length === 0) {
    return { x: 0, y: 0, zoom: 1, rotation: 0, shakeOffsetX: 0, shakeOffsetY: 0 };
  }
  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);
  if (frame <= sorted[0].frame) {
    const k = sorted[0];
    const [sx, sy] = deterministicShake(frame, k.shake);
    return { x: k.x, y: k.y, zoom: k.zoom, rotation: k.rotation, shakeOffsetX: sx, shakeOffsetY: sy };
  }
  if (frame >= sorted[sorted.length - 1].frame) {
    const k = sorted[sorted.length - 1];
    const [sx, sy] = deterministicShake(frame, k.shake);
    return { x: k.x, y: k.y, zoom: k.zoom, rotation: k.rotation, shakeOffsetX: sx, shakeOffsetY: sy };
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (frame >= a.frame && frame <= b.frame) {
      const span = Math.max(1, b.frame - a.frame);
      const rawT = (frame - a.frame) / span;
      const t = applyEasing(rawT, a.easing);
      const shake = lerp(a.shake, b.shake, t);
      const [sx, sy] = deterministicShake(frame, shake);
      return {
        x: lerp(a.x, b.x, t),
        y: lerp(a.y, b.y, t),
        zoom: lerp(a.zoom, b.zoom, t),
        rotation: lerp(a.rotation, b.rotation, t),
        shakeOffsetX: sx,
        shakeOffsetY: sy,
      };
    }
  }
  return { x: 0, y: 0, zoom: 1, rotation: 0, shakeOffsetX: 0, shakeOffsetY: 0 };
}

function deterministicShake(frame: number, amplitude: number): [number, number] {
  if (amplitude <= 0.01) return [0, 0];
  const sx = Math.sin(frame * 12.9898 + 1.23) * amplitude;
  const sy = Math.cos(frame * 78.233 + 4.56) * amplitude;
  return [sx, sy];
}
