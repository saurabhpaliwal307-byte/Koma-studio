import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteCelById,
  duplicateCelAfter,
  getOnionSkinNeighbors,
  moveCelToFrame,
  resolveCelAtFrame,
  resolveLayerTransformAtFrame,
} from './timeline';
import { encodeAnimatedGif } from './gifEncoder';
import type { Layer } from './types';

function makeLayer(): Layer {
  return {
    id: 'l1',
    name: 'Layer 1',
    type: 'cel',
    visible: true,
    locked: false,
    clippingMask: false,
    blendMode: 'normal',
    opacity: 1,
    parallaxDepth: 1,
    cels: [
      { id: 'c0', frameIndex: 0, durationFrames: 3, isKey: true, strokes: [] },
      { id: 'c3', frameIndex: 3, durationFrames: 2, isKey: true, strokes: [] },
      { id: 'c5', frameIndex: 5, durationFrames: 4, isKey: true, strokes: [] },
    ],
    keyframes: [
      {
        id: 'kf0',
        frame: 0,
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
        easing: 'linear',
      },
      {
        id: 'kf10',
        frame: 10,
        x: 200,
        y: 100,
        scaleX: 2,
        scaleY: 2,
        rotation: 90,
        opacity: 0.5,
        easing: 'linear',
      },
    ],
  };
}

test('resolveCelAtFrame honors exposure durations (holds on 2s and 3s)', () => {
  const layer = makeLayer();
  assert.equal(resolveCelAtFrame(layer, 0)?.id, 'c0');
  assert.equal(resolveCelAtFrame(layer, 2)?.id, 'c0');
  assert.equal(resolveCelAtFrame(layer, 3)?.id, 'c3');
  assert.equal(resolveCelAtFrame(layer, 4)?.id, 'c3');
  assert.equal(resolveCelAtFrame(layer, 6)?.id, 'c5');
  assert.equal(resolveCelAtFrame(layer, 12), null);
});

test('getOnionSkinNeighbors returns ordered previous and next cels', () => {
  const layer = makeLayer();
  const { prev, next } = getOnionSkinNeighbors(layer, 3, 2, 2);
  assert.equal(prev.length, 1);
  assert.equal(prev[0].cel.id, 'c0');
  assert.equal(next.length, 1);
  assert.equal(next[0].cel.id, 'c5');
});

test('timeline cel move, duplicate, and delete preserve valid ordering', () => {
  const layer = makeLayer();
  const moved = moveCelToFrame(layer.cels, 'c0', 10);
  assert.equal(moved[moved.length - 1].id, 'c0');
  assert.equal(moved[moved.length - 1].frameIndex, 10);

  const duped = duplicateCelAfter(layer.cels, 'c3', 'c3-dup');
  assert.equal(duped.length, 4);
  const dup = duped.find((c) => c.id === 'c3-dup');
  assert.ok(dup);
  assert.equal(dup.frameIndex, 5);

  const deleted = deleteCelById(duped, 'c3-dup');
  assert.equal(deleted.length, 3);
});

test('resolveLayerTransformAtFrame interpolates position, scale, rotation, opacity', () => {
  const layer = makeLayer();
  const mid = resolveLayerTransformAtFrame(layer.keyframes, 5);
  assert.equal(mid.x, 100);
  assert.equal(mid.y, 50);
  assert.equal(mid.scaleX, 1.5);
  assert.equal(mid.rotation, 45);
  assert.equal(mid.opacity, 0.75);
});

test('encodeAnimatedGif produces valid GIF89a header and trailer', () => {
  const rgba = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 139;
    rgba[i + 1] = 124;
    rgba[i + 2] = 255;
    rgba[i + 3] = 255;
  }
  const gif = encodeAnimatedGif(4, 4, [
    { rgba, delayCs: 8 },
    { rgba, delayCs: 8 },
  ]);
  const header = String.fromCharCode(gif[0], gif[1], gif[2], gif[3], gif[4], gif[5]);
  assert.equal(header, 'GIF89a');
  assert.equal(gif[gif.length - 1], 0x3b);
  assert.ok(gif.length > 800);
});
