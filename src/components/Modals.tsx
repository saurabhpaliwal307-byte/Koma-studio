import React, { useEffect, useState } from 'react';
import JSZip from 'jszip';
import {
  Download,
  FileCode2,
  Film,
  History,
  Image as ImageIcon,
  Keyboard,
  Plus,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { encodeTracksToWav } from '../audio/audioEngine';
import { renderSceneToCanvas } from '../canvas/renderer';
import { encodeAnimatedGif } from '../engine/gifEncoder';
import { parsePsdBuffer } from '../engine/psdImport';
import {
  listProjectVersions,
  parseProjectFile,
  serializeProjectFile,
} from '../engine/projectStore';
import { createBlankScene, createDemoScene } from '../engine/templates';
import type {
  Layer,
  ProjectVersion,
  Scene,
  ShortcutMap,
  StudioProject,
} from '../engine/types';

interface ProjectModalProps {
  open: boolean;
  project: StudioProject;
  onClose: () => void;
  onUpdateProject: (proj: StudioProject) => void;
  onImportLayers: (layers: Layer[]) => void;
  onSaveNamedVersion: (label: string) => Promise<void>;
}

export const ProjectModal: React.FC<ProjectModalProps> = ({
  open,
  project,
  onClose,
  onUpdateProject,
  onImportLayers,
  onSaveNamedVersion,
}) => {
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [versionLabel, setVersionLabel] = useState('');
  const [newWidth, setNewWidth] = useState(1280);
  const [newHeight, setNewHeight] = useState(720);
  const [newFps, setNewFps] = useState<12 | 24 | 25 | 30>(24);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      listProjectVersions().then(setVersions);
      setStatusMsg(null);
    }
  }, [open]);

  if (!open) return null;

  const handleDownloadJson = () => {
    const blob = new Blob([serializeProjectFile(project)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase()}.koma.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOpenProjectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const txt = await file.text();
      const loaded = parseProjectFile(txt);
      onUpdateProject(loaded);
      onClose();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to load project file');
    }
    e.target.value = '';
  };

  const handleImportArtwork = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    try {
      const first = files[0];
      if (first.name.toLowerCase().endsWith('.psd')) {
        const buf = await first.arrayBuffer();
        const psd = parsePsdBuffer(buf);
        const importedLayers: Layer[] = psd.layers.map((pl, idx) => {
          const c = document.createElement('canvas');
          c.width = psd.width;
          c.height = psd.height;
          const ctx = c.getContext('2d')!;
          const lc = document.createElement('canvas');
          lc.width = pl.width;
          lc.height = pl.height;
          const lctx = lc.getContext('2d')!;
          const imgData = lctx.createImageData(pl.width, pl.height);
          imgData.data.set(pl.rgba);
          lctx.putImageData(imgData, 0, 0);
          ctx.drawImage(lc, pl.left, pl.top);

          return {
            id: `psd-${Date.now()}-${idx}`,
            name: pl.name,
            type: 'cel',
            visible: pl.visible,
            locked: false,
            clippingMask: false,
            blendMode: 'normal',
            opacity: pl.opacity,
            parallaxDepth: 1,
            cels: [
              {
                id: `psd-cel-${Date.now()}-${idx}`,
                frameIndex: 0,
                durationFrames: 12,
                isKey: true,
                rasterDataUrl: c.toDataURL('image/png'),
                strokes: [],
              },
            ],
            keyframes: [],
          };
        });
        if (importedLayers.length === 0) {
          setStatusMsg('PSD file contained no readable layer channels.');
          return;
        }
        onImportLayers(importedLayers);
        setStatusMsg(`Imported ${importedLayers.length} editable PSD layers.`);
      } else {
        // PNG / JPEG / SVG / Image Sequence -> single layer with sequential cels
        const cels = await Promise.all(
          files.map(
            (file, idx) =>
              new Promise<{
                id: string;
                frameIndex: number;
                durationFrames: number;
                isKey: boolean;
                rasterDataUrl: string;
                strokes: [];
              }>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () =>
                  resolve({
                    id: `imp-cel-${Date.now()}-${idx}`,
                    frameIndex: idx * 2,
                    durationFrames: 2,
                    isKey: true,
                    rasterDataUrl: String(reader.result),
                    strokes: [],
                  });
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(file);
              })
          )
        );
        onImportLayers([
          {
            id: `imp-layer-${Date.now()}`,
            name: files.length > 1 ? 'Imported Sequence' : files[0].name,
            type: 'cel',
            visible: true,
            locked: false,
            clippingMask: false,
            blendMode: 'normal',
            opacity: 1,
            parallaxDepth: 1,
            cels,
            keyframes: [],
          },
        ]);
        setStatusMsg(`Imported ${cels.length} frame(s) into a new cel layer.`);
      }
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Import failed');
    }
    e.target.value = '';
  };

  const handleAddScene = () => {
    const newScene: Scene = createBlankScene(
      `scene-${Date.now()}`,
      `Cut ${String(project.scenes.length + 1).padStart(2, '0')}`,
      newWidth,
      newHeight,
      newFps
    );
    onUpdateProject({
      ...project,
      activeSceneId: newScene.id,
      scenes: [...project.scenes, newScene],
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Projects, Scenes and Imports"
        className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-lg bg-[var(--studio-surface)] border border-[var(--studio-border)] shadow-2xl overflow-hidden text-xs"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--studio-border)] bg-[var(--studio-panel)]">
          <h2 className="font-display font-semibold text-sm text-[var(--studio-text)]">
            Project Manager, Scenes & Imports
          </h2>
          <button type="button" onClick={onClose} aria-label="Close Modal" className="p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {statusMsg && (
            <div className="p-2.5 rounded bg-[#64D6C5]/15 border border-[#64D6C5]/50 text-[#64D6C5]">
              {statusMsg}
            </div>
          )}

          {/* Project Name & File Actions */}
          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-[var(--studio-text-muted)]">
              Project Title
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={project.name}
                onChange={(e) => onUpdateProject({ ...project, name: e.target.value })}
                className="flex-1 min-w-[200px] px-3 py-1.5 rounded bg-[var(--studio-bg)] border border-[var(--studio-border)] text-[var(--studio-text)]"
              />
              <button
                type="button"
                onClick={handleDownloadJson}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#8B7CFF] text-white font-medium"
              >
                <Download className="w-3.5 h-3.5" /> Save .koma.json
              </button>
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] cursor-pointer hover:border-[#8B7CFF]">
                <Upload className="w-3.5 h-3.5" /> Open Project
                <input
                  type="file"
                  accept=".json,.koma.json"
                  onChange={handleOpenProjectFile}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Scenes / Cuts */}
          <div className="space-y-2 pt-3 border-t border-[var(--studio-border)]">
            <h3 className="font-display font-semibold text-xs text-[var(--studio-text)]">
              Scenes / Production Cuts ({project.scenes.length})
            </h3>
            <div className="grid sm:grid-cols-2 gap-2">
              {project.scenes.map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => {
                    onUpdateProject({ ...project, activeSceneId: sc.id });
                    onClose();
                  }}
                  className={`p-2.5 rounded border text-left transition-colors ${
                    sc.id === project.activeSceneId
                      ? 'bg-[#8B7CFF]/15 border-[#8B7CFF]'
                      : 'bg-[var(--studio-panel)] border-[var(--studio-border)] hover:border-[var(--studio-text-muted)]'
                  }`}
                >
                  <div className="font-medium text-[var(--studio-text)]">{sc.name}</div>
                  <div className="font-mono text-[10px] text-[var(--studio-text-muted)]">
                    {sc.width}×{sc.height} · {sc.fps} FPS · {sc.totalFrames} frames
                  </div>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <select
                value={`${newWidth}x${newHeight}`}
                onChange={(e) => {
                  const [w, h] = e.target.value.split('x').map(Number);
                  setNewWidth(w);
                  setNewHeight(h);
                }}
                aria-label="New Scene Resolution"
                className="px-2 py-1.5 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] font-mono text-[11px]"
              >
                <option value="1920x1080">1920×1080 (Full HD)</option>
                <option value="1280x720">1280×720 (HD Anime)</option>
                <option value="1080x1080">1080×1080 (Square)</option>
                <option value="1080x1920">1080×1920 (Vertical Reel)</option>
              </select>
              <select
                value={newFps}
                onChange={(e) => setNewFps(Number(e.target.value) as 12 | 24 | 25 | 30)}
                aria-label="New Scene FPS"
                className="px-2 py-1.5 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] font-mono text-[11px]"
              >
                <option value={12}>12 FPS</option>
                <option value={24}>24 FPS</option>
                <option value={25}>25 FPS</option>
                <option value={30}>30 FPS</option>
              </select>
              <button
                type="button"
                onClick={handleAddScene}
                className="flex items-center gap-1 px-3 py-1.5 rounded bg-[#64D6C5] text-[#111827] font-semibold"
              >
                <Plus className="w-3.5 h-3.5" /> Add Scene
              </button>
              <button
                type="button"
                onClick={() => {
                  const demo = createDemoScene(`scene-${Date.now()}`, 'Anime Action Template');
                  onUpdateProject({
                    ...project,
                    activeSceneId: demo.id,
                    scenes: [...project.scenes, demo],
                  });
                  onClose();
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] hover:border-[#8B7CFF]"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#8B7CFF]" /> Load Demo Template
              </button>
            </div>
          </div>

          {/* Artwork Import */}
          <div className="space-y-2 pt-3 border-t border-[var(--studio-border)]">
            <h3 className="font-display font-semibold text-xs text-[var(--studio-text)]">
              Import Artwork & Image Sequences
            </h3>
            <label className="flex items-center justify-center gap-2 p-3 rounded border border-dashed border-[var(--studio-border)] bg-[var(--studio-panel)] hover:border-[#64D6C5] cursor-pointer">
              <ImageIcon className="w-4 h-4 text-[#64D6C5]" />
              <span>
                Import PNG, JPEG, SVG, Image Sequence (multi-select), or Layered PSD (.psd)
              </span>
              <input
                type="file"
                multiple
                accept=".png,.jpg,.jpeg,.svg,.psd,image/*"
                onChange={handleImportArtwork}
                className="hidden"
              />
            </label>
          </div>

          {/* Version History */}
          <div className="space-y-2 pt-3 border-t border-[var(--studio-border)]">
            <h3 className="font-display font-semibold text-xs text-[var(--studio-text)] flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-[#8B7CFF]" /> Version History & Recovery
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={versionLabel}
                onChange={(e) => setVersionLabel(e.target.value)}
                placeholder="Milestone label (e.g. Clean Tie-Down Pass)..."
                className="flex-1 px-2.5 py-1.5 rounded bg-[var(--studio-bg)] border border-[var(--studio-border)]"
              />
              <button
                type="button"
                onClick={async () => {
                  await onSaveNamedVersion(versionLabel.trim() || 'Manual Checkpoint');
                  setVersionLabel('');
                  const list = await listProjectVersions();
                  setVersions(list);
                }}
                className="px-3 py-1.5 rounded bg-[#8B7CFF] text-white font-medium"
              >
                Save Snapshot
              </button>
            </div>

            <div className="space-y-1 max-h-32 overflow-y-auto">
              {versions.length === 0 ? (
                <p className="text-[11px] text-[var(--studio-text-muted)]">
                  No manual checkpoints yet. Continuous IndexedDB autosave is active.
                </p>
              ) : (
                versions.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between p-2 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)]"
                  >
                    <div>
                      <div className="font-medium">{v.label}</div>
                      <div className="text-[10px] font-mono text-[var(--studio-text-muted)]">
                        {new Date(v.savedAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateProject(v.snapshot);
                        onClose();
                      }}
                      className="px-2.5 py-1 rounded bg-[#64D6C5] text-[#111827] font-semibold text-[11px]"
                    >
                      Restore
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ExportModalProps {
  open: boolean;
  scene: Scene;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ open, scene, onClose }) => {
  const [format, setFormat] = useState<'gif' | 'png-seq' | 'jpg-seq' | 'video' | 'wav'>('gif');
  const [scale, setScale] = useState(1);
  const [fps, setFps] = useState<number>(scene.fps);
  const [quality, setQuality] = useState(0.92);
  const [transparent, setTransparent] = useState(scene.transparentBg);
  const [startFrame, setStartFrame] = useState(1);
  const [endFrame, setEndFrame] = useState(scene.totalFrames);
  const [progress, setProgress] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFps(scene.fps);
      setTransparent(scene.transparentBg);
      setStartFrame(1);
      setEndFrame(scene.totalFrames);
      setProgress(null);
      setErrorMsg(null);
    }
  }, [open, scene]);

  if (!open) return null;

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    setErrorMsg(null);
    const outW = Math.max(64, Math.round(scene.width * scale));
    const outH = Math.max(64, Math.round(scene.height * scale));
    const fStart = Math.max(0, startFrame - 1);
    const fEnd = Math.min(scene.totalFrames - 1, Math.max(fStart, endFrame - 1));
    const count = fEnd - fStart + 1;

    try {
      if (format === 'wav') {
        const wav = encodeTracksToWav(scene.audioTracks, count / fps);
        triggerDownload(new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), `${scene.name}-audio.wav`);
        setProgress(100);
        return;
      }

      const off = document.createElement('canvas');
      off.width = outW;
      off.height = outH;
      const octx = off.getContext('2d')!;

      const renderToSize = (frameIdx: number) => {
        const full = document.createElement('canvas');
        full.width = scene.width;
        full.height = scene.height;
        const fctx = full.getContext('2d')!;
        renderSceneToCanvas(fctx, { ...scene, transparentBg: transparent }, {
          frame: frameIdx,
          applyCamera: true,
          applyEffects: true,
          showGuides: false,
          showRig: false,
          skipBackground: transparent,
        });
        octx.clearRect(0, 0, outW, outH);
        octx.drawImage(full, 0, 0, outW, outH);
      };

      if (format === 'gif') {
        const gifFrames = [];
        const delayCs = Math.max(2, Math.round(100 / fps));
        for (let f = fStart; f <= fEnd; f++) {
          renderToSize(f);
          const imgData = octx.getImageData(0, 0, outW, outH);
          gifFrames.push({ rgba: imgData.data, delayCs });
          setProgress(Math.round(((f - fStart + 1) / count) * 90));
        }
        const gifBytes = encodeAnimatedGif(outW, outH, gifFrames, true);
        triggerDownload(new Blob([new Uint8Array(gifBytes)], { type: 'image/gif' }), `${scene.name}.gif`);
        setProgress(100);
        return;
      }

      if (format === 'png-seq' || format === 'jpg-seq') {
        const zip = new JSZip();
        const mime = format === 'png-seq' ? 'image/png' : 'image/jpeg';
        const ext = format === 'png-seq' ? 'png' : 'jpg';
        for (let f = fStart; f <= fEnd; f++) {
          renderToSize(f);
          const blob = await new Promise<Blob>((res) =>
            off.toBlob((b) => res(b!), mime, quality)
          );
          zip.file(`frame_${String(f + 1).padStart(4, '0')}.${ext}`, blob);
          setProgress(Math.round(((f - fStart + 1) / count) * 90));
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        triggerDownload(zipBlob, `${scene.name}_${ext}_sequence.zip`);
        setProgress(100);
        return;
      }

      if (format === 'video') {
        if (typeof MediaRecorder === 'undefined') {
          throw new Error('MediaRecorder video encoding is not supported in this browser.');
        }
        const mp4Type = MediaRecorder.isTypeSupported('video/mp4')
          ? 'video/mp4'
          : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm';
        const stream = off.captureStream(fps);
        const recorder = new MediaRecorder(stream, {
          mimeType: mp4Type,
          videoBitsPerSecond: Math.round(4_000_000 * quality),
        });
        const chunks: BlobPart[] = [];
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) chunks.push(ev.data);
        };
        const done = new Promise<Blob>((resolve) => {
          recorder.onstop = () => resolve(new Blob(chunks, { type: mp4Type }));
        });
        recorder.start();

        const frameMs = 1000 / fps;
        for (let f = fStart; f <= fEnd; f++) {
          renderToSize(f);
          setProgress(Math.round(((f - fStart + 1) / count) * 95));
          await new Promise((r) => setTimeout(r, frameMs));
        }
        recorder.stop();
        const videoBlob = await done;
        const ext = mp4Type.includes('mp4') ? 'mp4' : 'webm';
        triggerDownload(videoBlob, `${scene.name}.${ext}`);
        setProgress(100);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Export failed');
      setProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Export Animation"
        className="w-full max-w-lg rounded-lg bg-[var(--studio-surface)] border border-[var(--studio-border)] shadow-2xl overflow-hidden text-xs"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--studio-border)] bg-[var(--studio-panel)]">
          <h2 className="font-display font-semibold text-sm flex items-center gap-2">
            <Film className="w-4 h-4 text-[#8B7CFF]" /> Export Animation
          </h2>
          <button type="button" onClick={onClose} aria-label="Close Export Modal" className="p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { id: 'gif', label: 'Animated GIF' },
              { id: 'video', label: 'Video (MP4/WebM)' },
              { id: 'png-seq', label: 'PNG Seq (ZIP)' },
              { id: 'jpg-seq', label: 'JPEG Seq (ZIP)' },
              { id: 'wav', label: 'WAV Audio' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFormat(item.id as typeof format)}
                className={`px-2.5 py-2 rounded border font-medium text-[11px] ${
                  format === item.id
                    ? 'bg-[#8B7CFF]/15 border-[#8B7CFF] text-[#8B7CFF]'
                    : 'bg-[var(--studio-panel)] border-[var(--studio-border)]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-[var(--studio-text-muted)] mb-1">
                Resolution Scale
              </label>
              <select
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] font-mono"
              >
                <option value={1}>100% ({scene.width}×{scene.height})</option>
                <option value={0.5}>50% ({Math.round(scene.width * 0.5)}×{Math.round(scene.height * 0.5)})</option>
                <option value={1.5}>150% ({Math.round(scene.width * 1.5)}×{Math.round(scene.height * 1.5)})</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-[var(--studio-text-muted)] mb-1">
                Export Frame Rate
              </label>
              <select
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] font-mono"
              >
                <option value={12}>12 FPS</option>
                <option value={24}>24 FPS</option>
                <option value={25}>25 FPS</option>
                <option value={30}>30 FPS</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-[var(--studio-text-muted)] mb-1">
                Frame Range
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={scene.totalFrames}
                  value={startFrame}
                  onChange={(e) => setStartFrame(Number(e.target.value))}
                  className="w-full px-2 py-1 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] font-mono"
                />
                <span>to</span>
                <input
                  type="number"
                  min={1}
                  max={scene.totalFrames}
                  value={endFrame}
                  onChange={(e) => setEndFrame(Number(e.target.value))}
                  className="w-full px-2 py-1 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-[var(--studio-text-muted)] mb-1">
                Quality ({Math.round(quality * 100)}%)
              </label>
              <input
                type="range"
                min={0.4}
                max={1}
                step={0.05}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="w-full accent-[#8B7CFF]"
              />
            </div>
          </div>

          <label className="flex items-center justify-between p-2 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] cursor-pointer">
            <span>Preserve Alpha Transparency (PNG Sequence)</span>
            <input
              type="checkbox"
              checked={transparent}
              onChange={(e) => setTransparent(e.target.checked)}
              className="accent-[#64D6C5]"
            />
          </label>

          {errorMsg && (
            <div className="p-2 rounded bg-rose-500/15 border border-rose-500/40 text-rose-300">
              {errorMsg}
            </div>
          )}

          {progress !== null && (
            <div className="space-y-1">
              <div className="h-2 rounded bg-[var(--studio-bg)] overflow-hidden">
                <div
                  className="h-full bg-[#64D6C5] transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="text-[11px] font-mono text-[#64D6C5]">
                {progress === 100 ? 'Export complete!' : `Rendering ${progress}%...`}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded border border-[var(--studio-border)]"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="flex items-center gap-1.5 px-4 py-2 rounded bg-[#8B7CFF] hover:bg-[#7A6AEF] text-white font-semibold"
            >
              <Download className="w-3.5 h-3.5" /> Render & Download
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ShortcutsModalProps {
  open: boolean;
  shortcuts: ShortcutMap;
  onClose: () => void;
  onUpdateShortcut: (action: string, key: string) => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({
  open,
  shortcuts,
  onClose,
  onUpdateShortcut,
}) => {
  const [listeningAction, setListeningAction] = useState<string | null>(null);

  useEffect(() => {
    if (!listeningAction) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
      if (e.shiftKey) parts.push('Shift');
      const k = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
      parts.push(k);
      onUpdateShortcut(listeningAction, parts.join('+'));
      setListeningAction(null);
    };
    window.addEventListener('keydown', handler, { once: true });
    return () => window.removeEventListener('keydown', handler);
  }, [listeningAction, onUpdateShortcut]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard Shortcuts and Workflow Guide"
        className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-lg bg-[var(--studio-surface)] border border-[var(--studio-border)] shadow-2xl overflow-hidden text-xs"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--studio-border)] bg-[var(--studio-panel)]">
          <h2 className="font-display font-semibold text-sm flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-[#64D6C5]" /> Keyboard Shortcuts & Production Guide
          </h2>
          <button type="button" onClick={onClose} aria-label="Close Shortcuts" className="p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="p-3 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] space-y-1.5">
            <div className="font-display font-semibold flex items-center gap-1.5 text-[#8B7CFF]">
              <FileCode2 className="w-3.5 h-3.5" /> Quick Animation Pipeline
            </div>
            <p className="text-[11px] text-[var(--studio-text-muted)] leading-relaxed">
              1. Sketch keys with Pencil (B) and toggle Onion Skin (K) to see previous/next frames.
              2. Add Keyframes or hold exposures (+1f) on the Timeline / X-Sheet.
              3. Ink with Sakuga G-Pen (N) and flood-fill with Fill Bucket (G).
              4. Add Camera keyframes, Anime Glow, or Skeletal Rig poses, then Export GIF/PNG/Video.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {Object.entries(shortcuts).map(([action, key]) => (
              <div
                key={action}
                className="flex items-center justify-between p-2 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)]"
              >
                <span className="capitalize text-[11px]">{action}</span>
                <button
                  type="button"
                  onClick={() => setListeningAction(action)}
                  className={`px-2 py-0.5 rounded font-mono text-[10px] border ${
                    listeningAction === action
                      ? 'border-[#8B7CFF] bg-[#8B7CFF] text-white'
                      : 'border-[var(--studio-border)] bg-[var(--studio-bg)]'
                  }`}
                >
                  {listeningAction === action ? 'Press key...' : key}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
