import { applyEasing, lerp } from './math';
import type { CelFrame, Layer, TransformKeyframe } from './types';

export interface ResolvedLayerTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
}

/**
 * Resolves the active cel drawing on a layer at a given timeline frame.
 * Supports exposure duration holds (e.g. drawing on 2s, 3s, holds).
 */
export function resolveCelAtFrame(layer: Layer, frame: number): CelFrame | null {
  if (layer.cels.length === 0) return null;
  const sorted = [...layer.cels].sort((a, b) => a.frameIndex - b.frameIndex);

  for (let i = sorted.length - 1; i >= 0; i--) {
    const cel = sorted[i];
    const end = cel.frameIndex + Math.max(1, cel.durationFrames) - 1;
    if (frame >= cel.frameIndex && frame <= end) {
      return cel;
    }
  }
  return null;
}

/**
 * Returns previous and next unique cel frames for Onion Skinning.
 */
export function getOnionSkinNeighbors(
  layer: Layer,
  currentFrame: number,
  prevCount: number,
  nextCount: number
): { prev: { cel: CelFrame; distance: number }[]; next: { cel: CelFrame; distance: number }[] } {
  const sorted = [...layer.cels].sort((a, b) => a.frameIndex - b.frameIndex);
  const current = resolveCelAtFrame(layer, currentFrame);

  const prevList: { cel: CelFrame; distance: number }[] = [];
  const nextList: { cel: CelFrame; distance: number }[] = [];

  for (const cel of sorted) {
    if (current && cel.id === current.id) continue;
    if (cel.frameIndex < currentFrame) {
      prevList.push({ cel, distance: 0 });
    } else if (cel.frameIndex > currentFrame) {
      nextList.push({ cel, distance: 0 });
    }
  }

  const prev = prevList
    .slice(-Math.max(0, prevCount))
    .reverse()
    .map((item, idx) => ({ cel: item.cel, distance: idx + 1 }));

  const next = nextList
    .slice(0, Math.max(0, nextCount))
    .map((item, idx) => ({ cel: item.cel, distance: idx + 1 }));

  return { prev, next };
}

/**
 * Interpolates layer transform & opacity keyframes at a timeline frame.
 */
export function resolveLayerTransformAtFrame(
  keyframes: TransformKeyframe[],
  frame: number
): ResolvedLayerTransform {
  if (keyframes.length === 0) {
    return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };
  }
  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);
  if (frame <= sorted[0].frame) {
    const k = sorted[0];
    return {
      x: k.x,
      y: k.y,
      scaleX: k.scaleX,
      scaleY: k.scaleY,
      rotation: k.rotation,
      opacity: k.opacity,
    };
  }
  if (frame >= sorted[sorted.length - 1].frame) {
    const k = sorted[sorted.length - 1];
    return {
      x: k.x,
      y: k.y,
      scaleX: k.scaleX,
      scaleY: k.scaleY,
      rotation: k.rotation,
      opacity: k.opacity,
    };
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (frame >= a.frame && frame <= b.frame) {
      const span = Math.max(1, b.frame - a.frame);
      const rawT = (frame - a.frame) / span;
      const t = applyEasing(rawT, a.easing, a.bezier);
      return {
        x: lerp(a.x, b.x, t),
        y: lerp(a.y, b.y, t),
        scaleX: lerp(a.scaleX, b.scaleX, t),
        scaleY: lerp(a.scaleY, b.scaleY, t),
        rotation: lerp(a.rotation, b.rotation, t),
        opacity: lerp(a.opacity, b.opacity, t),
      };
    }
  }
  return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };
}

export function insertOrUpdateCel(
  cels: CelFrame[],
  newCel: CelFrame
): CelFrame[] {
  const filtered = cels.filter((c) => c.frameIndex !== newCel.frameIndex);
  return [...filtered, newCel].sort((a, b) => a.frameIndex - b.frameIndex);
}

export function moveCelToFrame(
  cels: CelFrame[],
  celId: string,
  targetFrameIndex: number
): CelFrame[] {
  const target = Math.max(0, targetFrameIndex);
  const moving = cels.find((c) => c.id === celId);
  if (!moving) return cels;

  const others = cels.filter((c) => c.id !== celId && c.frameIndex !== target);
  return [...others, { ...moving, frameIndex: target }].sort(
    (a, b) => a.frameIndex - b.frameIndex
  );
}

export function duplicateCelAfter(
  cels: CelFrame[],
  celId: string,
  newId: string
): CelFrame[] {
  const source = cels.find((c) => c.id === celId);
  if (!source) return cels;
  const nextIndex = source.frameIndex + Math.max(1, source.durationFrames);
  // Shift subsequent cels right if colliding
  const shifted = cels.map((c) =>
    c.frameIndex >= nextIndex
      ? { ...c, frameIndex: c.frameIndex + Math.max(1, source.durationFrames) }
      : c
  );
  const copy: CelFrame = {
    ...source,
    id: newId,
    frameIndex: nextIndex,
    strokes: source.strokes.map((s) => ({
      ...s,
      id: `${s.id}-copy-${Math.random().toString(36).slice(2, 6)}`,
      points: s.points.map((p) => ({ ...p })),
    })),
  };
  return [...shifted, copy].sort((a, b) => a.frameIndex - b.frameIndex);
}

export function deleteCelById(cels: CelFrame[], celId: string): CelFrame[] {
  if (cels.length <= 1) return cels;
  return cels.filter((c) => c.id !== celId);
}
