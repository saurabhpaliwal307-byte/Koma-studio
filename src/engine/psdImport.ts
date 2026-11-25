/**
 * Lightweight browser-native PSD parser for layered 8-bit RGB/RGBA PSD import.
 * Extracts layer names, bounds, visibility, opacity, and uncompressed or PackBits RLE pixel channels.
 */

export interface ParsedPsdLayer {
  name: string;
  top: number;
  left: number;
  bottom: number;
  right: number;
  opacity: number;
  visible: boolean;
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface ParsedPsd {
  width: number;
  height: number;
  layers: ParsedPsdLayer[];
}

function decodePackBits(src: Uint8Array, expectedLen: number): Uint8Array {
  const out = new Uint8Array(expectedLen);
  let i = 0;
  let o = 0;
  while (i < src.length && o < expectedLen) {
    const n = (src[i++] << 24) >> 24; // signed int8
    if (n >= 0) {
      const count = n + 1;
      for (let k = 0; k < count && i < src.length && o < expectedLen; k++) {
        out[o++] = src[i++];
      }
    } else if (n !== -128) {
      const count = 1 - n;
      const val = src[i++] ?? 0;
      for (let k = 0; k < count && o < expectedLen; k++) {
        out[o++] = val;
      }
    }
  }
  return out;
}

export function parsePsdBuffer(buffer: ArrayBuffer): ParsedPsd {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  const sig = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (sig !== '8BPS') {
    throw new Error('Not a valid PSD file (missing 8BPS signature)');
  }
  offset += 4;
  const version = view.getUint16(offset);
  offset += 2;
  if (version !== 1) {
    throw new Error('Only standard PSD (version 1) files are supported');
  }
  offset += 6; // reserved
  const channels = view.getUint16(offset);
  offset += 2;
  const height = view.getUint32(offset);
  offset += 4;
  const width = view.getUint32(offset);
  offset += 4;
  const depth = view.getUint16(offset);
  offset += 2;
  const colorMode = view.getUint16(offset);
  offset += 2;

  if (depth !== 8 || (colorMode !== 3 && colorMode !== 1)) {
    throw new Error('Only 8-bit RGB or Grayscale PSD files are supported for layered import');
  }

  // Color mode data section
  const colorModeLen = view.getUint32(offset);
  offset += 4 + colorModeLen;

  // Image resources section
  const resourcesLen = view.getUint32(offset);
  offset += 4 + resourcesLen;

  // Layer and mask information section
  const layerMaskLen = view.getUint32(offset);
  offset += 4;

  const layers: ParsedPsdLayer[] = [];

  if (layerMaskLen > 0) {
    const layerInfoLen = view.getUint32(offset);
    offset += 4;
    if (layerInfoLen > 0) {
      let layerCount = view.getInt16(offset);
      offset += 2;
      if (layerCount < 0) layerCount = Math.abs(layerCount);

      interface RawLayerMeta {
        name: string;
        top: number;
        left: number;
        bottom: number;
        right: number;
        opacity: number;
        visible: boolean;
        channels: { id: number; length: number }[];
      }

      const metas: RawLayerMeta[] = [];
      for (let i = 0; i < layerCount; i++) {
        const top = view.getInt32(offset);
        const left = view.getInt32(offset + 4);
        const bottom = view.getInt32(offset + 8);
        const right = view.getInt32(offset + 12);
        offset += 16;

        const chCount = view.getUint16(offset);
        offset += 2;
        const chInfo: { id: number; length: number }[] = [];
        for (let c = 0; c < chCount; c++) {
          const id = view.getInt16(offset);
          const length = view.getUint32(offset + 2);
          offset += 6;
          chInfo.push({ id, length });
        }

        // Blend mode sig '8BIM' + key (4) + opacity (1) + clipping (1) + flags (1) + filler (1)
        offset += 8;
        const opacity = bytes[offset++];
        offset++; // clipping
        const flags = bytes[offset++];
        offset++; // filler
        const visible = (flags & 0x02) === 0;

        const extraLen = view.getUint32(offset);
        offset += 4;
        const extraEnd = offset + extraLen;

        // Layer mask data
        const maskDataLen = view.getUint32(offset);
        offset += 4 + maskDataLen;
        // Blending ranges
        const blendRangesLen = view.getUint32(offset);
        offset += 4 + blendRangesLen;
        // Pascal string name padded to multiple of 4
        const nameLen = bytes[offset++];
        let name = '';
        for (let n = 0; n < nameLen; n++) {
          name += String.fromCharCode(bytes[offset + n]);
        }
        offset = extraEnd;

        metas.push({
          name: name.trim() || `PSD Layer ${i + 1}`,
          top,
          left,
          bottom,
          right,
          opacity: opacity / 255,
          visible,
          channels: chInfo,
        });
      }

      for (const meta of metas) {
        const lw = Math.max(0, meta.right - meta.left);
        const lh = Math.max(0, meta.bottom - meta.top);
        const channelData = new Map<number, Uint8Array>();

        for (const ch of meta.channels) {
          const chEnd = offset + ch.length;
          if (lw > 0 && lh > 0 && ch.length >= 2) {
            const compression = view.getUint16(offset);
            const rawStart = offset + 2;
            if (compression === 0) {
              channelData.set(ch.id, bytes.slice(rawStart, rawStart + lw * lh));
            } else if (compression === 1) {
              // RLE PackBits: 2*lh bytes of row byte counts followed by RLE rows
              const rowCountsEnd = rawStart + lh * 2;
              const decoded = new Uint8Array(lw * lh);
              let rowPos = rowCountsEnd;
              for (let y = 0; y < lh; y++) {
                const rowLen = view.getUint16(rawStart + y * 2);
                const rowBytes = decodePackBits(bytes.slice(rowPos, rowPos + rowLen), lw);
                decoded.set(rowBytes, y * lw);
                rowPos += rowLen;
              }
              channelData.set(ch.id, decoded);
            }
          }
          offset = chEnd;
        }

        if (lw > 0 && lh > 0) {
          const rgba = new Uint8ClampedArray(lw * lh * 4);
          const rCh = channelData.get(0);
          const gCh = channelData.get(1) ?? rCh;
          const bCh = channelData.get(2) ?? rCh;
          const aCh = channelData.get(-1);

          for (let p = 0; p < lw * lh; p++) {
            rgba[p * 4] = rCh ? rCh[p] : 0;
            rgba[p * 4 + 1] = gCh ? gCh[p] : 0;
            rgba[p * 4 + 2] = bCh ? bCh[p] : 0;
            rgba[p * 4 + 3] = aCh ? aCh[p] : 255;
          }

          layers.push({
            name: meta.name,
            top: meta.top,
            left: meta.left,
            bottom: meta.bottom,
            right: meta.right,
            opacity: meta.opacity,
            visible: meta.visible,
            rgba,
            width: lw,
            height: lh,
          });
        }
      }
    }
  }

  // Fallback if PSD has flattened composite only
  if (layers.length === 0 && channels >= 3) {
    // Minimal composite fallback
    return { width, height, layers: [] };
  }

  return { width, height, layers };
}
