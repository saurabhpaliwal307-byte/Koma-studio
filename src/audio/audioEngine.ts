import type { AudioTrack, MouthShapeId } from '../engine/types';

const imageOrAudioCache = new Map<string, AudioBuffer>();

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) {
      sharedAudioCtx = new Ctor();
    }
  }
  return sharedAudioCtx;
}

export async function decodeAudioFile(
  file: File
): Promise<{
  durationSec: number;
  peaks: number[];
  dataUrl: string;
}> {
  const arrayBuffer = await file.arrayBuffer();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const ctx = getAudioContext();
  if (!ctx) {
    return {
      durationSec: 3,
      peaks: Array.from({ length: 48 }, (_, i) => 0.2 + 0.6 * Math.abs(Math.sin(i * 0.45))),
      dataUrl,
    };
  }

  const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  imageOrAudioCache.set(dataUrl, audioBuffer);

  const channel = audioBuffer.getChannelData(0);
  const barCount = Math.min(120, Math.max(24, Math.ceil(audioBuffer.duration * 12)));
  const blockSize = Math.max(1, Math.floor(channel.length / barCount));
  const peaks: number[] = [];

  for (let i = 0; i < barCount; i++) {
    const start = i * blockSize;
    let maxVal = 0;
    for (let j = 0; j < blockSize && start + j < channel.length; j++) {
      const v = Math.abs(channel[start + j]);
      if (v > maxVal) maxVal = v;
    }
    peaks.push(Math.min(1, maxVal));
  }

  return {
    durationSec: audioBuffer.duration,
    peaks,
    dataUrl,
  };
}

let activeSources: AudioBufferSourceNode[] = [];

export function stopAllAudioPlayback(): void {
  for (const src of activeSources) {
    try {
      src.stop();
    } catch {
      // Ignore already stopped
    }
  }
  activeSources = [];
}

export async function playTracksFromFrame(
  tracks: AudioTrack[],
  currentFrame: number,
  fps: number
): Promise<void> {
  stopAllAudioPlayback();
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    await ctx.resume().catch(() => {});
  }

  const currentSec = currentFrame / fps;

  for (const track of tracks) {
    if (track.muted) continue;
    const trackStartSec = track.startFrame / fps;
    const offset = currentSec - trackStartSec;
    if (offset >= track.durationSec) continue;

    let buffer: AudioBuffer | undefined;
    if (track.dataUrl) {
      buffer = imageOrAudioCache.get(track.dataUrl);
      if (!buffer) {
        try {
          const res = await fetch(track.dataUrl);
          const ab = await res.arrayBuffer();
          buffer = await ctx.decodeAudioData(ab);
          imageOrAudioCache.set(track.dataUrl, buffer);
        } catch {
          continue;
        }
      }
    } else if (track.peaks.length > 0) {
      const cacheKey = `synth:${track.id}:${track.durationSec}:${track.peaks.join(',')}`;
      buffer = imageOrAudioCache.get(cacheKey);
      if (!buffer) {
        const sr = ctx.sampleRate || 22050;
        const len = Math.max(sr, Math.floor(track.durationSec * sr));
        const synth = ctx.createBuffer(1, len, sr);
        const ch = synth.getChannelData(0);
        for (let i = 0; i < len; i++) {
          const t = i / sr;
          const idx = Math.min(
            track.peaks.length - 1,
            Math.floor((t / Math.max(0.1, track.durationSec)) * track.peaks.length)
          );
          const amp = track.peaks[idx] * 0.14;
          ch[i] = (Math.sin(2 * Math.PI * 240 * t) * 0.65 + Math.sin(2 * Math.PI * 480 * t) * 0.35) * amp;
        }
        buffer = synth;
        imageOrAudioCache.set(cacheKey, buffer);
      }
    }

    if (!buffer) continue;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = track.volume;
    source.connect(gain);
    gain.connect(ctx.destination);

    if (offset >= 0) {
      source.start(0, offset);
    } else {
      source.start(ctx.currentTime + Math.abs(offset), 0);
    }
    activeSources.push(source);
  }
}

/**
 * Play a short audio scrub blip or tone feedback when scrubbing dialogue tracks.
 */
export function scrubAudioFrame(tracks: AudioTrack[], frame: number, fps: number): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const hasActivePeak = tracks.some((t) => {
    if (t.muted) return false;
    const relFrame = frame - t.startFrame;
    if (relFrame < 0) return false;
    const idx = Math.floor((relFrame / fps / Math.max(0.1, t.durationSec)) * t.peaks.length);
    return (t.peaks[idx] ?? 0) > 0.22;
  });
  if (!hasActivePeak) return;

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 220 + (frame % 6) * 28;
  gain.gain.setValueAtTime(0.03, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.045);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.05);
}

/**
 * Renders a simple synthesized WAV file from project audio peaks or demo tone for WAV export.
 */
export function encodeTracksToWav(tracks: AudioTrack[], durationSec: number): Uint8Array {
  const sampleRate = 22050;
  const numSamples = Math.max(sampleRate, Math.floor(durationSec * sampleRate));
  const dataSize = numSamples * 2; // 16-bit mono
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;
    for (const tr of tracks) {
      if (tr.muted || tr.peaks.length === 0) continue;
      const idx = Math.min(tr.peaks.length - 1, Math.floor((t / Math.max(0.1, durationSec)) * tr.peaks.length));
      const amp = tr.peaks[idx] * tr.volume * 0.25;
      sample += Math.sin(2 * Math.PI * 260 * t) * amp;
    }
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, Math.floor(clamped * 32767), true);
  }

  return new Uint8Array(buffer);
}

export const MOUTH_SHAPES: { id: MouthShapeId; label: string; phoneme: string; path: string }[] = [
  { id: 'REST', label: 'Rest', phoneme: 'Closed / Breath', path: 'M 8 18 Q 20 19 32 18' },
  { id: 'A', label: 'A / Ah', phoneme: 'Father, Car', path: 'M 8 14 Q 20 12 32 14 Q 30 28 20 28 Q 10 28 8 14 Z' },
  { id: 'E', label: 'E / Eh', phoneme: 'Bed, Smile', path: 'M 6 16 Q 20 14 34 16 Q 32 23 20 23 Q 8 23 6 16 Z' },
  { id: 'I', label: 'I / Ee', phoneme: 'See, Grin', path: 'M 6 17 Q 20 16 34 17 L 33 21 Q 20 22 7 21 Z' },
  { id: 'O', label: 'O / Oh', phoneme: 'Go, Shock', path: 'M 13 13 A 7 8 0 1 0 27 13 A 7 8 0 1 0 13 13 Z' },
  { id: 'U', label: 'U / Oo', phoneme: 'You, Soon', path: 'M 15 15 A 5 5 0 1 0 25 15 A 5 5 0 1 0 15 15 Z' },
  { id: 'M_B_P', label: 'M / B / P', phoneme: 'Mom, Pop', path: 'M 8 18 L 32 18' },
  { id: 'F_V', label: 'F / V', phoneme: 'Fire, Voice', path: 'M 8 16 Q 20 15 32 16 L 30 20 Q 20 20 10 20 Z' },
  { id: 'L', label: 'L / Tongue', phoneme: 'Light, La', path: 'M 9 15 Q 20 13 31 15 Q 29 25 20 25 Q 11 25 9 15 Z' },
  { id: 'TH', label: 'Th', phoneme: 'The, Think', path: 'M 9 16 L 31 16 L 29 21 L 11 21 Z' },
];
