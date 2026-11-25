import test from 'node:test';
import assert from 'node:assert/strict';
import { BRUSH_TEXTURE_CATALOG, DEFAULT_BRUSH_PRESETS } from './templates.ts';

test('BRUSH_TEXTURE_CATALOG contains all 31 unique brush textures including clouds with presets', () => {
  assert.equal(BRUSH_TEXTURE_CATALOG.length, 31);
  const catalogIds = new Set(BRUSH_TEXTURE_CATALOG.map((c) => c.id));
  assert.equal(catalogIds.size, 31);

  const cloudTextures = BRUSH_TEXTURE_CATALOG.filter((c) => c.group === 'Cloud');
  assert.equal(cloudTextures.length, 5);

  const presetTextures = new Set(DEFAULT_BRUSH_PRESETS.map((p) => p.texture));
  for (const item of BRUSH_TEXTURE_CATALOG) {
    assert.ok(
      presetTextures.has(item.id),
      `Expected DEFAULT_BRUSH_PRESETS to contain a preset for texture "${item.id}"`
    );
  }
  assert.ok(DEFAULT_BRUSH_PRESETS.length >= 35);
});
