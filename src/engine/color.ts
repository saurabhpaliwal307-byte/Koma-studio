export interface RgbColor {
  r: number; // 0..255
  g: number; // 0..255
  b: number; // 0..255
}

export interface HsvColor {
  h: number; // 0..360
  s: number; // 0..100
  v: number; // 0..100
}

export interface CmykColor {
  c: number; // 0..100
  m: number; // 0..100
  y: number; // 0..100
  k: number; // 0..100
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function normalizeHex(hex: string): string {
  const clean = hex.trim().replace('#', '');
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    return (
      '#' +
      clean
        .split('')
        .map((c) => c + c)
        .join('')
        .toUpperCase()
    );
  }
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return '#' + clean.toUpperCase();
  }
  return '#8B7CFF';
}

export function hexToRgb(hex: string): RgbColor {
  const norm = normalizeHex(hex).slice(1);
  const n = parseInt(norm, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

export function rgbToHex({ r, g, b }: RgbColor): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

export function rgbToHsv({ r, g, b }: RgbColor): HsvColor {
  const rn = clamp(r, 0, 255) / 255;
  const gn = clamp(g, 0, 255) / 255;
  const bn = clamp(b, 0, 255) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : Math.round((d / max) * 100);
  const v = Math.round(max * 100);
  return { h, s, v };
}

export function hsvToRgb({ h, s, v }: HsvColor): RgbColor {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 100) / 100;
  const val = clamp(v, 0, 100) / 100;
  const f = (n: number, k = (n + hue / 60) % 6) =>
    val - val * sat * Math.max(Math.min(k, 4 - k, 1), 0);
  return {
    r: Math.round(f(5) * 255),
    g: Math.round(f(3) * 255),
    b: Math.round(f(1) * 255),
  };
}

export function hsvToHex(hsv: HsvColor): string {
  return rgbToHex(hsvToRgb(hsv));
}

export function rgbToCmyk({ r, g, b }: RgbColor): CmykColor {
  const rn = clamp(r, 0, 255) / 255;
  const gn = clamp(g, 0, 255) / 255;
  const bn = clamp(b, 0, 255) / 255;
  const k = 1 - Math.max(rn, gn, bn);
  if (k >= 0.9999) {
    return { c: 0, m: 0, y: 0, k: 100 };
  }
  return {
    c: Math.round(((1 - rn - k) / (1 - k)) * 100),
    m: Math.round(((1 - gn - k) / (1 - k)) * 100),
    y: Math.round(((1 - bn - k) / (1 - k)) * 100),
    k: Math.round(k * 100),
  };
}

export function cmykToRgb({ c, m, y, k }: CmykColor): RgbColor {
  const cn = clamp(c, 0, 100) / 100;
  const mn = clamp(m, 0, 100) / 100;
  const yn = clamp(y, 0, 100) / 100;
  const kn = clamp(k, 0, 100) / 100;
  return {
    r: Math.round(255 * (1 - cn) * (1 - kn)),
    g: Math.round(255 * (1 - mn) * (1 - kn)),
    b: Math.round(255 * (1 - yn) * (1 - kn)),
  };
}

export interface ColorHarmonies {
  complementary: string[];
  analogous: string[];
  triadic: string[];
  splitComplementary: string[];
  monochrome: string[];
}

export function generateColorHarmonies(hex: string): ColorHarmonies {
  const hsv = rgbToHsv(hexToRgb(hex));
  const rot = (deg: number) => hsvToHex({ ...hsv, h: (hsv.h + deg + 360) % 360 });
  return {
    complementary: [normalizeHex(hex), rot(180)],
    analogous: [rot(-30), normalizeHex(hex), rot(30)],
    triadic: [normalizeHex(hex), rot(120), rot(240)],
    splitComplementary: [normalizeHex(hex), rot(150), rot(210)],
    monochrome: [
      hsvToHex({ h: hsv.h, s: Math.max(10, hsv.s - 35), v: Math.min(100, hsv.v + 25) }),
      hsvToHex({ h: hsv.h, s: hsv.s, v: Math.min(100, hsv.v + 12) }),
      normalizeHex(hex),
      hsvToHex({ h: hsv.h, s: Math.min(100, hsv.s + 10), v: Math.max(15, hsv.v - 20) }),
      hsvToHex({ h: hsv.h, s: Math.min(100, hsv.s + 15), v: Math.max(8, hsv.v - 45) }),
    ],
  };
}

export const CURATED_PALETTES: { id: string; name: string; colors: string[] }[] = [
  {
    id: 'anime-core',
    name: 'Anime Cel Core',
    colors: [
      '#F3F4F6', '#17191D', '#8B7CFF', '#64D6C5', '#FF6B6B', '#FFD166',
      '#4EA8DE', '#FF8FAB', '#A8E6CF', '#3D405B', '#E07A5F', '#81B29A',
    ],
  },
  {
    id: 'ghibli-nature',
    name: 'Pastoral Gouache',
    colors: [
      '#F4F1DE', '#3D405B', '#E07A5F', '#81B29A', '#F2CC8F', '#5F7A61',
      '#8AB0AB', '#D4A373', '#FAEDCD', '#CCD5AE', '#6B705C', '#283618',
    ],
  },
  {
    id: 'cyber-night',
    name: 'Midnight Neon',
    colors: [
      '#0B0F19', '#1E293B', '#38BDF8', '#22D3EE', '#A855F7', '#F43F5E',
      '#FB7185', '#FACC15', '#34D399', '#E2E8F0', '#6366F1', '#EC4899',
    ],
  },
  {
    id: 'pastel-wash',
    name: 'Pastel Watercolor',
    colors: [
      '#FFFDF9', '#CDB4DB', '#FFC8DD', '#FFAFCC', '#BDE0FE', '#A2D2FF',
      '#CAFFBF', '#FDFFB6', '#FFD6A5', '#FFADAD', '#9BF6FF', '#6D6875',
    ],
  },
  {
    id: 'manga-ink',
    name: 'Manga Ink & Screentone',
    colors: [
      '#FFFFFF', '#E5E7EB', '#D1D5DB', '#9CA3AF', '#6B7280', '#4B5563',
      '#374151', '#1F2937', '#111827', '#000000', '#4EA8DE', '#EF4444',
    ],
  },
];
