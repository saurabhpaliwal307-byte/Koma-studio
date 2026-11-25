import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  CURATED_PALETTES,
  cmykToRgb,
  generateColorHarmonies,
  hexToRgb,
  hsvToHex,
  normalizeHex,
  rgbToCmyk,
  rgbToHex,
  rgbToHsv,
} from '../engine/color';

type ColorModeTab = 'wheel' | 'hsv' | 'rgb' | 'cmyk' | 'harmony';

interface ColorWheelProps {
  color: string;
  palette: string[];
  recentColors?: string[];
  onChangeColor: (hex: string) => void;
  onAddPaletteSwatch: (hex: string) => void;
}

export const ColorWheel: React.FC<ColorWheelProps> = ({
  color,
  palette,
  recentColors = [],
  onChangeColor,
  onAddPaletteSwatch,
}) => {
  const wheelRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<ColorModeTab>('wheel');
  const [selectedPaletteId, setSelectedPaletteId] = useState<string>('project');
  const [hexDraft, setHexDraft] = useState(color);

  useEffect(() => {
    setHexDraft(color);
  }, [color]);

  const rgb = useMemo(() => hexToRgb(color), [color]);
  const hsv = useMemo(() => rgbToHsv(rgb), [rgb]);
  const cmyk = useMemo(() => rgbToCmyk(rgb), [rgb]);
  const harmonies = useMemo(() => generateColorHarmonies(color), [color]);
  const brightness = Math.max(0.15, hsv.v / 100);

  useEffect(() => {
    if (mode !== 'wheel') return;
    const canvas = wheelRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const r = size / 2;
    const img = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - r;
        const dy = y - r;
        const dist = Math.hypot(dx, dy);
        const off = (y * size + x) * 4;
        if (dist > r) {
          img.data[off + 3] = 0;
          continue;
        }
        const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
        const sat = Math.min(1, dist / r);
        const f = (n: number, k = (n + hue / 60) % 6) =>
          brightness - brightness * sat * Math.max(Math.min(k, 4 - k, 1), 0);
        img.data[off] = Math.round(f(5) * 255);
        img.data[off + 1] = Math.round(f(3) * 255);
        img.data[off + 2] = Math.round(f(1) * 255);
        img.data[off + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [brightness, mode]);

  const pickFromWheel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = wheelRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const r = canvas.width / 2;
    const dx = x - r;
    const dy = y - r;
    const dist = Math.min(r, Math.hypot(dx, dy));
    const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    const sat = Math.round((dist / r) * 100);
    onChangeColor(hsvToHex({ h: Math.round(hue), s: sat, v: Math.round(brightness * 100) }));
  };

  const activeSwatches =
    selectedPaletteId === 'project'
      ? palette
      : CURATED_PALETTES.find((p) => p.id === selectedPaletteId)?.colors ?? palette;

  return (
    <div className="space-y-3">
      {/* Color Mode Tabs */}
      <div className="flex items-center bg-[var(--studio-bg)] border border-[var(--studio-border)] rounded p-0.5 gap-0.5">
        {(
          [
            { id: 'wheel', label: 'Wheel' },
            { id: 'hsv', label: 'HSV' },
            { id: 'rgb', label: 'RGB' },
            { id: 'cmyk', label: 'CMYK' },
            { id: 'harmony', label: 'Harmony' },
          ] as { id: ColorModeTab; label: string }[]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMode(tab.id)}
            className={`flex-1 py-1 rounded text-[10px] font-medium transition-colors ${
              mode === tab.id
                ? 'bg-[#8B7CFF] text-white'
                : 'text-[var(--studio-text-muted)] hover:text-[var(--studio-text)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active Color & Hex Input */}
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded border border-[var(--studio-border)] shrink-0 shadow-inner"
          style={{ backgroundColor: color }}
        />
        <input
          type="text"
          value={hexDraft}
          aria-label="Hex Color Value"
          onChange={(e) => {
            setHexDraft(e.target.value);
            if (/^#?[0-9a-fA-F]{6}$/.test(e.target.value.trim())) {
              onChangeColor(normalizeHex(e.target.value));
            }
          }}
          onBlur={() => setHexDraft(color)}
          className="flex-1 px-2 py-1 text-xs font-mono bg-[var(--studio-bg)] border border-[var(--studio-border)] rounded text-[var(--studio-text)]"
        />
        <span className="font-mono text-[10px] text-[var(--studio-text-muted)] shrink-0">
          {rgb.r},{rgb.g},{rgb.b}
        </span>
      </div>

      {/* Mode Body */}
      {mode === 'wheel' && (
        <div className="flex items-center gap-3">
          <canvas
            ref={wheelRef}
            width={128}
            height={128}
            onPointerDown={pickFromWheel}
            onPointerMove={(e) => {
              if (e.buttons === 1) pickFromWheel(e);
            }}
            className="w-28 h-28 rounded-full cursor-crosshair shrink-0 border border-[var(--studio-border)]"
          />
          <div className="flex-1 space-y-2">
            <div>
              <label className="block text-[11px] text-[var(--studio-text-muted)] mb-1">
                Brightness ({hsv.v}%)
              </label>
              <input
                type="range"
                min={15}
                max={100}
                value={Math.max(15, hsv.v)}
                aria-label="Color Brightness"
                onChange={(e) =>
                  onChangeColor(hsvToHex({ ...hsv, v: Number(e.target.value) }))
                }
                className="w-full accent-[#8B7CFF]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[var(--studio-text-muted)] mb-1">
                Saturation ({hsv.s}%)
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={hsv.s}
                aria-label="Color Saturation"
                onChange={(e) =>
                  onChangeColor(hsvToHex({ ...hsv, s: Number(e.target.value) }))
                }
                className="w-full accent-[#64D6C5]"
              />
            </div>
          </div>
        </div>
      )}

      {mode === 'hsv' && (
        <div className="space-y-2">
          <div>
            <div className="flex justify-between text-[10px] text-[var(--studio-text-muted)]">
              <span>Hue</span>
              <span className="font-mono tabular-nums">{hsv.h}°</span>
            </div>
            <input
              type="range"
              min={0}
              max={360}
              value={hsv.h}
              aria-label="Hue"
              onChange={(e) => onChangeColor(hsvToHex({ ...hsv, h: Number(e.target.value) }))}
              className="w-full accent-[#8B7CFF]"
            />
          </div>
          <div>
            <div className="flex justify-between text-[10px] text-[var(--studio-text-muted)]">
              <span>Saturation</span>
              <span className="font-mono tabular-nums">{hsv.s}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={hsv.s}
              aria-label="Saturation"
              onChange={(e) => onChangeColor(hsvToHex({ ...hsv, s: Number(e.target.value) }))}
              className="w-full accent-[#64D6C5]"
            />
          </div>
          <div>
            <div className="flex justify-between text-[10px] text-[var(--studio-text-muted)]">
              <span>Value / Luminance</span>
              <span className="font-mono tabular-nums">{hsv.v}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={hsv.v}
              aria-label="Value"
              onChange={(e) => onChangeColor(hsvToHex({ ...hsv, v: Number(e.target.value) }))}
              className="w-full accent-[#8B7CFF]"
            />
          </div>
        </div>
      )}

      {mode === 'rgb' && (
        <div className="space-y-2">
          {(['r', 'g', 'b'] as const).map((ch) => (
            <div key={ch}>
              <div className="flex justify-between text-[10px] text-[var(--studio-text-muted)]">
                <span className="uppercase">{ch === 'r' ? 'Red' : ch === 'g' ? 'Green' : 'Blue'}</span>
                <span className="font-mono tabular-nums">{rgb[ch]}</span>
              </div>
              <input
                type="range"
                min={0}
                max={255}
                value={rgb[ch]}
                aria-label={`RGB ${ch.toUpperCase()}`}
                onChange={(e) =>
                  onChangeColor(rgbToHex({ ...rgb, [ch]: Number(e.target.value) }))
                }
                className="w-full accent-[#8B7CFF]"
              />
            </div>
          ))}
        </div>
      )}

      {mode === 'cmyk' && (
        <div className="space-y-1.5">
          {(
            [
              { k: 'c', label: 'Cyan' },
              { k: 'm', label: 'Magenta' },
              { k: 'y', label: 'Yellow' },
              { k: 'k', label: 'Black (K)' },
            ] as const
          ).map(({ k, label }) => (
            <div key={k}>
              <div className="flex justify-between text-[10px] text-[var(--studio-text-muted)]">
                <span>{label}</span>
                <span className="font-mono tabular-nums">{cmyk[k]}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={cmyk[k]}
                aria-label={`CMYK ${label}`}
                onChange={(e) =>
                  onChangeColor(
                    rgbToHex(cmykToRgb({ ...cmyk, [k]: Number(e.target.value) }))
                  )
                }
                className="w-full accent-[#64D6C5]"
              />
            </div>
          ))}
        </div>
      )}

      {mode === 'harmony' && (
        <div className="space-y-2">
          {(
            [
              { label: 'Complementary', list: harmonies.complementary },
              { label: 'Analogous', list: harmonies.analogous },
              { label: 'Triadic', list: harmonies.triadic },
              { label: 'Monochrome Shades', list: harmonies.monochrome },
            ] as const
          ).map((group) => (
            <div key={group.label}>
              <span className="block text-[10px] text-[var(--studio-text-muted)] mb-1">
                {group.label}
              </span>
              <div className="flex gap-1">
                {group.list.map((hex, i) => (
                  <button
                    key={`${hex}-${i}`}
                    type="button"
                    onClick={() => onChangeColor(hex)}
                    title={hex}
                    aria-label={`Harmony Color ${hex}`}
                    className="flex-1 h-6 rounded border border-[var(--studio-border)] hover:scale-105 transition-transform"
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent Colors */}
      {recentColors.length > 0 && (
        <div>
          <span className="block text-[10px] text-[var(--studio-text-muted)] mb-1">
            Recent Colors
          </span>
          <div className="flex gap-1 flex-wrap">
            {recentColors.slice(0, 8).map((rc, i) => (
              <button
                key={`${rc}-${i}`}
                type="button"
                onClick={() => onChangeColor(rc)}
                aria-label={`Recent Color ${rc}`}
                className="w-5 h-5 rounded border border-[var(--studio-border)]"
                style={{ backgroundColor: rc }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Studio & Curated Palettes */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <select
            value={selectedPaletteId}
            onChange={(e) => setSelectedPaletteId(e.target.value)}
            aria-label="Select Color Palette Theme"
            className="flex-1 px-1.5 py-1 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] text-[11px]"
          >
            <option value="project">Project Swatches</option>
            {CURATED_PALETTES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onAddPaletteSwatch(color)}
            aria-label="Add Color to Palette"
            className="flex items-center gap-0.5 text-[11px] text-[#64D6C5] hover:underline shrink-0"
          >
            <Plus className="w-3 h-3" /> Save
          </button>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {activeSwatches.map((swatch, idx) => (
            <button
              key={`${swatch}-${idx}`}
              type="button"
              onClick={() => onChangeColor(swatch)}
              aria-label={`Select Swatch ${swatch}`}
              className={`h-6 rounded border transition-transform hover:scale-105 ${
                color.toLowerCase() === swatch.toLowerCase()
                  ? 'border-white ring-2 ring-[#8B7CFF]'
                  : 'border-[var(--studio-border)]'
              }`}
              style={{ backgroundColor: swatch }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
