/**
 * Pure TypeScript GIF89a animated GIF encoder (6-8-6 uniform RGB palette + LZW compression).
 * Runs completely client-side with zero external workers or dependencies.
 */

export interface GifFrameInput {
  rgba: Uint8ClampedArray;
  delayCs: number; // centiseconds (1/100th sec)
}

function buildUniformPalette(): { palette: Uint8Array; mapRgb: (r: number, g: number, b: number) => number } {
  // 6x8x5 = 240 color cube + 16 grayscale ramp = 256 colors
  const palette = new Uint8Array(256 * 3);
  let idx = 0;
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 8; g++) {
      for (let b = 0; b < 5; b++) {
        palette[idx * 3] = Math.round((r * 255) / 5);
        palette[idx * 3 + 1] = Math.round((g * 255) / 7);
        palette[idx * 3 + 2] = Math.round((b * 255) / 4);
        idx++;
      }
    }
  }
  for (let i = 0; i < 16; i++) {
    const v = Math.round((i * 255) / 15);
    palette[idx * 3] = v;
    palette[idx * 3 + 1] = v;
    palette[idx * 3 + 2] = v;
    idx++;
  }

  const mapRgb = (r: number, g: number, b: number) => {
    const ri = Math.min(5, Math.round((r * 5) / 255));
    const gi = Math.min(7, Math.round((g * 7) / 255));
    const bi = Math.min(4, Math.round((b * 4) / 255));
    return ri * 40 + gi * 5 + bi;
  };

  return { palette, mapRgb };
}

function lzwEncode(minCodeSize: number, indices: Uint8Array): number[] {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  const maxTableSize = 4096;

  let dict = new Map<string, number>();
  const resetDict = () => {
    dict = new Map<string, number>();
    codeSize = minCodeSize + 1;
    nextCode = eoiCode + 1;
  };

  const outBytes: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;

  const emitCode = (code: number) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      outBytes.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  emitCode(clearCode);
  if (indices.length === 0) {
    emitCode(eoiCode);
    if (bitCount > 0) outBytes.push(bitBuffer & 0xff);
    return outBytes;
  }

  let prefix = String(indices[0]);
  for (let i = 1; i < indices.length; i++) {
    const c = indices[i];
    const key = `${prefix},${c}`;
    if (dict.has(key)) {
      prefix = key;
    } else {
      const prefixCode = prefix.includes(',') ? dict.get(prefix)! : Number(prefix);
      emitCode(prefixCode);
      if (nextCode < maxTableSize) {
        dict.set(key, nextCode++);
        if (nextCode > 1 << codeSize && codeSize < 12) {
          codeSize++;
        }
      } else {
        emitCode(clearCode);
        resetDict();
      }
      prefix = String(c);
    }
  }

  const finalCode = prefix.includes(',') ? dict.get(prefix)! : Number(prefix);
  emitCode(finalCode);
  emitCode(eoiCode);
  if (bitCount > 0) {
    outBytes.push(bitBuffer & 0xff);
  }
  return outBytes;
}

export function encodeAnimatedGif(
  width: number,
  height: number,
  frames: GifFrameInput[],
  loop = true
): Uint8Array {
  const { palette, mapRgb } = buildUniformPalette();
  const bytes: number[] = [];

  const pushStr = (s: string) => {
    for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i));
  };
  const pushU16 = (v: number) => {
    bytes.push(v & 0xff, (v >> 8) & 0xff);
  };

  // Header
  pushStr('GIF89a');
  // Logical Screen Descriptor
  pushU16(width);
  pushU16(height);
  bytes.push(0xf7); // Global color table flag (1), color res (7), sort (0), size (7 -> 256 colors)
  bytes.push(0x00); // Background color index
  bytes.push(0x00); // Pixel aspect ratio

  // Global Color Table (256 * 3 = 768 bytes)
  for (let i = 0; i < palette.length; i++) {
    bytes.push(palette[i]);
  }

  // Netscape 2.0 looping extension
  if (loop) {
    bytes.push(0x21, 0xff, 0x0b);
    pushStr('NETSCAPE2.0');
    bytes.push(0x03, 0x01, 0x00, 0x00, 0x00);
  }

  for (const frame of frames) {
    // Graphic Control Extension
    bytes.push(0x21, 0xf9, 0x04, 0x04); // dispose=1 (do not dispose), no transparency
    pushU16(Math.max(2, Math.round(frame.delayCs)));
    bytes.push(0x00, 0x00);

    // Image Descriptor
    bytes.push(0x2c);
    pushU16(0);
    pushU16(0);
    pushU16(width);
    pushU16(height);
    bytes.push(0x00); // no local color table

    // Quantize pixels
    const pixelCount = width * height;
    const indices = new Uint8Array(pixelCount);
    const rgba = frame.rgba;
    for (let p = 0; p < pixelCount; p++) {
      const off = p * 4;
      const a = rgba[off + 3] / 255;
      // Blend over dark charcoal or white if semi-transparent
      const r = Math.round(rgba[off] * a + 23 * (1 - a));
      const g = Math.round(rgba[off + 1] * a + 25 * (1 - a));
      const b = Math.round(rgba[off + 2] * a + 29 * (1 - a));
      indices[p] = mapRgb(r, g, b);
    }

    const minCodeSize = 8;
    bytes.push(minCodeSize);
    const compressed = lzwEncode(minCodeSize, indices);

    // Emit sub-blocks (max 255 bytes each)
    let pos = 0;
    while (pos < compressed.length) {
      const chunkLen = Math.min(255, compressed.length - pos);
      bytes.push(chunkLen);
      for (let i = 0; i < chunkLen; i++) {
        bytes.push(compressed[pos + i]);
      }
      pos += chunkLen;
    }
    bytes.push(0x00); // Block terminator
  }

  bytes.push(0x3b); // GIF Trailer
  return new Uint8Array(bytes);
}
