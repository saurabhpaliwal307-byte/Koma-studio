import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyEasing,
  getSymmetricPoints,
  resolveCameraAtFrame,
  solveForwardKinematics,
  solveTwoBoneIK,
  stabilizePoints,
} from './math';
import type { Bone, CameraKeyframe } from './types';

test('stabilizePoints smooths jitter while keeping start and end anchors', () => {
  const raw = [
    { x: 0, y: 0, pressure: 0.5 },
    { x: 10, y: 20, pressure: 0.5 },
    { x: 20, y: 0, pressure: 0.5 },
    { x: 30, y: 10, pressure: 0.5 },
  ];
  const smoothed = stabilizePoints(raw, 8);
  assert.equal(smoothed.length, raw.length);
  assert.equal(smoothed[0].x, 0);
  assert.equal(smoothed[0].y, 0);
  // Middle point should be dampened toward prior y
  assert.ok(smoothed[1].y < 20 && smoothed[1].y > 0);
});

test('getSymmetricPoints produces mirrored and radial points accurately', () => {
  const pt = { x: 100, y: 50, pressure: 0.8 };
  const quad = getSymmetricPoints(pt, 400, 300, 'quad');
  assert.equal(quad.length, 4);
  assert.deepEqual(
    quad.map((p) => [p.x, p.y]),
    [
      [100, 50],
      [300, 50],
      [100, 250],
      [300, 250],
    ]
  );

  const radial = getSymmetricPoints(pt, 400, 300, 'radial', 6);
  assert.equal(radial.length, 6);
});

test('solveForwardKinematics computes chained parent-child joint positions', () => {
  const bones: Bone[] = [
    { id: 'root', name: 'Root', parentId: null, x: 100, y: 100, length: 50, angle: 0, color: '#fff' },
    { id: 'child', name: 'Child', parentId: 'root', x: 0, y: 0, length: 40, angle: 90, color: '#fff' },
  ];
  const world = solveForwardKinematics(bones);
  assert.ok(Math.abs(world.root.endX - 150) < 1e-6);
  assert.ok(Math.abs(world.root.endY - 100) < 1e-6);
  assert.ok(Math.abs(world.child.startX - 150) < 1e-6);
  assert.ok(Math.abs(world.child.endX - 150) < 1e-6);
  assert.ok(Math.abs(world.child.endY - 140) < 1e-6);
});

test('solveTwoBoneIK places end effector near reachable target', () => {
  const { angle1Local, angle2Local } = solveTwoBoneIK(0, 0, 0, 50, 50, 70, 0, 1);
  const bones: Bone[] = [
    { id: 'b1', name: 'Upper', parentId: null, x: 0, y: 0, length: 50, angle: angle1Local, color: '#fff' },
    { id: 'b2', name: 'Lower', parentId: 'b1', x: 0, y: 0, length: 50, angle: angle2Local, color: '#fff' },
  ];
  const world = solveForwardKinematics(bones);
  assert.ok(world.b2);
  assert.ok(Math.abs(world.b2.endX - 70) < 0.5);
  assert.ok(Math.abs(world.b2.endY - 0) < 0.5);
});

test('applyEasing and resolveCameraAtFrame interpolate smoothly', () => {
  assert.equal(applyEasing(0, 'ease-in-out'), 0);
  assert.equal(applyEasing(1, 'ease-in-out'), 1);
  assert.ok(applyEasing(0.25, 'ease-in') < 0.25);

  const keys: CameraKeyframe[] = [
    { id: 'k0', frame: 0, x: 0, y: 0, zoom: 1, rotation: 0, shake: 0, easing: 'linear' },
    { id: 'k10', frame: 10, x: 100, y: 50, zoom: 2, rotation: 10, shake: 0, easing: 'linear' },
  ];
  const mid = resolveCameraAtFrame(keys, 5);
  assert.equal(mid.x, 50);
  assert.equal(mid.y, 25);
  assert.equal(mid.zoom, 1.5);
  assert.equal(mid.rotation, 5);
});
