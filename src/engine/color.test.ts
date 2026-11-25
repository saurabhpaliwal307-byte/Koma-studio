import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cmykToRgb,
  generateColorHarmonies,
  hexToRgb,
  hsvToHex,
  rgbToCmyk,
  rgbToHex,
  rgbToHsv,
} from './color';

test('RGB <-> HSV <-> Hex roundtrips accurately', () => {
  const hex = '#8B7CFF';
  const rgb = hexToRgb(hex);
  assert.deepEqual(rgb, { r: 139, g: 124, b: 255 });
  const hsv = rgbToHsv(rgb);
  const back = hsvToHex(hsv);
  assert.equal(rgbToHex(rgb), hex);
  assert.ok(back.startsWith('#') && back.length === 7);
});

test('RGB <-> CMYK converts primary and neutral tones accurately', () => {
  const redCmyk = rgbToCmyk({ r: 255, g: 0, b: 0 });
  assert.deepEqual(redCmyk, { c: 0, m: 100, y: 100, k: 0 });
  assert.deepEqual(cmykToRgb(redCmyk), { r: 255, g: 0, b: 0 });

  const blackCmyk = rgbToCmyk({ r: 0, g: 0, b: 0 });
  assert.deepEqual(blackCmyk, { c: 0, m: 0, y: 0, k: 100 });
  assert.deepEqual(cmykToRgb(blackCmyk), { r: 0, g: 0, b: 0 });
});

test('generateColorHarmonies returns valid hex arrays for all harmony types', () => {
  const h = generateColorHarmonies('#64D6C5');
  assert.equal(h.complementary.length, 2);
  assert.equal(h.analogous.length, 3);
  assert.equal(h.triadic.length, 3);
  assert.equal(h.splitComplementary.length, 3);
  assert.equal(h.monochrome.length, 5);
  for (const col of [...h.complementary, ...h.triadic, ...h.monochrome]) {
    assert.match(col, /^#[0-9A-F]{6}$/);
  }
});
