import React, { useMemo, useState } from 'react';
import {
  AudioWaveform,
  Camera,
  ChevronDown,
  ChevronUp,
  Copy,
  Flag,
  Layers,
  Minus,
  Plus,
  Table2,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { generateCelThumbnail } from '../canvas/renderer';
import { resolveCelAtFrame } from '../engine/timeline';
import type {
  AudioTrack,
  CelFrame,
  EasingType,
  OnionSkinConfig,
  Scene,
  StudioMode,
} from '../engine/types';

interface BottomTimelineProps {
  scene: Scene;
  currentFrame: number;
  activeLayerId: string;
  onionSkin: OnionSkinConfig;
  studioMode: StudioMode;
  onSeekFrame: (frame: number) => void;
  onSelectLayer: (layerId: string) => void;
  onUpdateOnionSkin: (patch: Partial<OnionSkinConfig>) => void;
  onInsertKeyframe: () => void;
  onDuplicateCel: () => void;
  onDeleteCel: () => void;
  onAdjustExposure: (delta: -1 | 1) => void;
  onMoveCel: (layerId: string, celId: string, targetFrame: number) => void;
  onAddTimelineMarker: (frame: number, label: string) => void;
  onAddTransformKeyframe: (easing: EasingType) => void;
  onUpdateTotalFrames: (total: number) => void;
  onAddAudioTrack: (file: File) => void;
  onUpdateAudioTrack: (id: string, patch: Partial<AudioTrack>) => void;
}

export const BottomTimeline: React.FC<BottomTimelineProps> = ({
  scene,
  currentFrame,
  activeLayerId,
  onionSkin,
  studioMode,
  onSeekFrame,
  onSelectLayer,
  onUpdateOnionSkin,
  onInsertKeyframe,
  onDuplicateCel,
  onDeleteCel,
  onAdjustExposure,
  onMoveCel,
  onAddTimelineMarker,
  onAddTransformKeyframe,
  onUpdateTotalFrames,
  onAddAudioTrack,
  onUpdateAudioTrack,
}) => {
  const [viewMode, setViewMode] = useState<'timeline' | 'xsheet'>('timeline');
  const [collapsed, setCollapsed] = useState(false);
  const [cellWidth, setCellWidth] = useState(32);
  const [dragInfo, setDragInfo] = useState<{ layerId: string; celId: string } | null>(null);
  const [easingChoice, setEasingChoice] = useState<EasingType>('ease-in-out');

  const frames = useMemo(
    () => Array.from({ length: scene.totalFrames }, (_, i) => i),
    [scene.totalFrames]
  );

  // Cache thumbnails per cel id + stroke count for crisp timeline rendering
  const thumbnails = useMemo(() => {
    const map = new Map<string, string>();
    for (const layer of scene.layers) {
      for (const cel of layer.cels) {
        if (cel.strokes.length > 0 || cel.rasterDataUrl) {
          map.set(cel.id, generateCelThumbnail(cel, scene.width, scene.height));
        }
      }
    }
    return map;
  }, [scene.layers, scene.width, scene.height]);

  const activeLayer = scene.layers.find((l) => l.id === activeLayerId) ?? scene.layers[0];
  const activeCel = activeLayer ? resolveCelAtFrame(activeLayer, currentFrame) : null;

  return (
    <section
      aria-label="Animation Timeline and Exposure Sheet"
      className={`shrink-0 flex flex-col bg-[var(--studio-surface)] border-t border-[var(--studio-border)] select-none transition-all ${
        collapsed ? 'h-10' : 'h-56 sm:h-64'
      }`}
    >
      {/* Timeline Toolbar */}
      <div className="h-10 shrink-0 flex items-center justify-between gap-2 px-3 bg-[var(--studio-panel)] border-b border-[var(--studio-border)] overflow-x-auto">
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Timeline / X-Sheet Switch */}
          {studioMode !== 'beginner' && (
            <div className="flex items-center bg-[var(--studio-bg)] border border-[var(--studio-border)] rounded p-0.5 mr-1">
              <button
                type="button"
                onClick={() => setViewMode('timeline')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                  viewMode === 'timeline'
                    ? 'bg-[#8B7CFF] text-white'
                    : 'text-[var(--studio-text-muted)]'
                }`}
              >
                <Layers className="w-3 h-3" /> Timeline
              </button>
              <button
                type="button"
                onClick={() => setViewMode('xsheet')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                  viewMode === 'xsheet'
                    ? 'bg-[#64D6C5] text-[#111827]'
                    : 'text-[var(--studio-text-muted)]'
                }`}
              >
                <Table2 className="w-3 h-3" /> X-Sheet
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onInsertKeyframe}
            aria-label="Insert New Keyframe"
            className="flex items-center gap-1 px-2 py-1 rounded bg-[#8B7CFF] hover:bg-[#7A6AEF] text-white text-[11px] font-medium whitespace-nowrap"
          >
            <Plus className="w-3 h-3" /> Keyframe
          </button>

          <button
            type="button"
            onClick={onDuplicateCel}
            aria-label="Duplicate Current Frame"
            className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--studio-bg)] border border-[var(--studio-border)] hover:border-[#8B7CFF] text-[11px] whitespace-nowrap"
          >
            <Copy className="w-3 h-3" /> Dup
          </button>

          <div className="flex items-center bg-[var(--studio-bg)] border border-[var(--studio-border)] rounded">
            <button
              type="button"
              onClick={() => onAdjustExposure(-1)}
              aria-label="Decrease Exposure Duration"
              title="Hold -1 Frame"
              className="px-1.5 py-1 hover:bg-[var(--studio-border)]/40"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="px-1.5 font-mono tabular-nums text-[11px] text-[var(--studio-text-muted)]">
              {activeCel ? `${activeCel.durationFrames}f` : '0f'}
            </span>
            <button
              type="button"
              onClick={() => onAdjustExposure(1)}
              aria-label="Increase Exposure Duration"
              title="Hold +1 Frame"
              className="px-1.5 py-1 hover:bg-[var(--studio-border)]/40"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          <button
            type="button"
            onClick={onDeleteCel}
            aria-label="Delete Current Cel"
            className="p-1.5 rounded bg-[var(--studio-bg)] border border-[var(--studio-border)] text-[var(--studio-text-muted)] hover:text-rose-400"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Onion Skin & Marker & Curve Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[var(--studio-bg)] border border-[var(--studio-border)]">
            <button
              type="button"
              onClick={() => onUpdateOnionSkin({ enabled: !onionSkin.enabled })}
              aria-label="Toggle Onion Skinning"
              aria-pressed={onionSkin.enabled}
              className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${
                onionSkin.enabled
                  ? 'bg-[#64D6C5] text-[#111827]'
                  : 'text-[var(--studio-text-muted)]'
              }`}
            >
              Onion Skin
            </button>
            {onionSkin.enabled && (
              <>
                <input
                  type="range"
                  min={0.1}
                  max={0.75}
                  step={0.05}
                  value={onionSkin.opacity}
                  onChange={(e) => onUpdateOnionSkin({ opacity: Number(e.target.value) })}
                  aria-label="Onion Skin Opacity"
                  className="w-14 accent-[#64D6C5]"
                />
                <select
                  value={onionSkin.prevFrames}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    onUpdateOnionSkin({ prevFrames: n, nextFrames: n });
                  }}
                  aria-label="Onion Skin Neighbor Count"
                  className="bg-transparent text-[11px] font-mono"
                >
                  <option value={1}>±1</option>
                  <option value={2}>±2</option>
                  <option value={3}>±3</option>
                </select>
              </>
            )}
          </div>

          {studioMode !== 'beginner' && (
            <>
              <button
                type="button"
                onClick={() => onAddTimelineMarker(currentFrame, `M${currentFrame + 1}`)}
                aria-label="Add Timeline Marker"
                className="hidden md:flex items-center gap-1 px-2 py-1 rounded bg-[var(--studio-bg)] border border-[var(--studio-border)] text-[11px] hover:border-[#8B7CFF]"
              >
                <Flag className="w-3 h-3 text-[#8B7CFF]" /> Marker
              </button>

              <div className="hidden lg:flex items-center gap-1">
                <select
                  value={easingChoice}
                  onChange={(e) => setEasingChoice(e.target.value as EasingType)}
                  aria-label="Transform Interpolation Curve"
                  className="bg-[var(--studio-bg)] border border-[var(--studio-border)] rounded px-1.5 py-1 text-[11px]"
                >
                  <option value="linear">Linear</option>
                  <option value="ease-in">Ease In</option>
                  <option value="ease-out">Ease Out</option>
                  <option value="ease-in-out">Ease In-Out</option>
                  <option value="bezier">Cubic Bezier</option>
                </select>
                <button
                  type="button"
                  onClick={() => onAddTransformKeyframe(easingChoice)}
                  className="px-2 py-1 rounded bg-[var(--studio-bg)] border border-[var(--studio-border)] text-[11px] hover:border-[#64D6C5]"
                >
                  + Tween Key
                </button>
              </div>

              <label className="hidden sm:flex items-center gap-1 px-2 py-1 rounded bg-[var(--studio-bg)] border border-[var(--studio-border)] text-[11px] cursor-pointer hover:border-[#64D6C5]">
                <AudioWaveform className="w-3 h-3 text-[#64D6C5]" />
                <span>Audio</span>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onAddAudioTrack(f);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </label>
            </>
          )}

          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[var(--studio-text-muted)]">Len</span>
            <input
              type="number"
              min={8}
              max={240}
              value={scene.totalFrames}
              onChange={(e) => onUpdateTotalFrames(Math.max(8, Math.min(240, Number(e.target.value))))}
              aria-label="Total Timeline Frames"
              className="w-12 px-1.5 py-0.5 rounded bg-[var(--studio-bg)] border border-[var(--studio-border)] font-mono tabular-nums text-[11px]"
            />
          </div>

          <input
            type="range"
            min={20}
            max={56}
            value={cellWidth}
            onChange={(e) => setCellWidth(Number(e.target.value))}
            aria-label="Timeline Zoom"
            className="hidden sm:block w-14 accent-[#8B7CFF]"
          />

          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand Timeline' : 'Collapse Timeline'}
            className="p-1 rounded text-[var(--studio-text-muted)] hover:text-[var(--studio-text)]"
          >
            {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Timeline or X-Sheet Body */}
      {!collapsed && viewMode === 'timeline' && (
        <div className="flex-1 flex overflow-hidden">
          {/* Fixed Left Track Labels */}
          <div className="w-36 sm:w-44 shrink-0 border-r border-[var(--studio-border)] bg-[var(--studio-panel)] overflow-y-auto">
            <div className="h-7 px-2 flex items-center justify-between border-b border-[var(--studio-border)] text-[10px] font-mono text-[var(--studio-text-muted)]">
              <span>TRACKS</span>
              <span>{scene.fps} FPS</span>
            </div>

            {studioMode !== 'beginner' && (
              <div className="h-7 px-2 flex items-center gap-1.5 border-b border-[var(--studio-border)]/70 text-[11px] text-[#64D6C5]">
                <Camera className="w-3 h-3" />
                <span className="truncate">Camera 2D</span>
              </div>
            )}

            {[...scene.layers].reverse().map((layer) => (
              <button
                key={layer.id}
                type="button"
                onClick={() => onSelectLayer(layer.id)}
                className={`w-full h-11 px-2 flex items-center justify-between border-b border-[var(--studio-border)]/60 text-left text-[11px] ${
                  layer.id === activeLayerId
                    ? 'bg-[#8B7CFF]/15 text-[var(--studio-text)] font-medium'
                    : 'text-[var(--studio-text-muted)] hover:bg-[var(--studio-bg)]/40'
                }`}
              >
                <span className="truncate">{layer.name}</span>
                <span className="font-mono text-[10px] opacity-70">{layer.cels.length}</span>
              </button>
            ))}

            {scene.audioTracks.map((track) => (
              <div
                key={track.id}
                className="h-9 px-2 flex items-center justify-between border-b border-[var(--studio-border)]/60 text-[11px]"
              >
                <span className="truncate text-[#64D6C5]">{track.name}</span>
                <button
                  type="button"
                  onClick={() => onUpdateAudioTrack(track.id, { muted: !track.muted })}
                  aria-label={`Mute ${track.name}`}
                  className="p-0.5"
                >
                  {track.muted ? (
                    <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-[#64D6C5]" />
                  )}
                </button>
              </div>
            ))}
          </div>

          {/* Scrollable Frame Grid */}
          <div className="flex-1 overflow-auto relative">
            <div style={{ width: scene.totalFrames * cellWidth }}>
              {/* Frame Ruler */}
              <div className="h-7 flex border-b border-[var(--studio-border)] bg-[var(--studio-panel)] sticky top-0 z-10">
                {frames.map((f) => {
                  const isCurrent = f === currentFrame;
                  const marker = scene.markers.find((m) => m.frame === f);
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => onSeekFrame(f)}
                      style={{ width: cellWidth }}
                      className={`shrink-0 h-full border-r border-[var(--studio-border)]/50 font-mono tabular-nums text-[10px] flex flex-col items-center justify-center relative ${
                        isCurrent
                          ? 'bg-[#8B7CFF] text-white font-semibold'
                          : 'text-[var(--studio-text-muted)] hover:bg-[var(--studio-border)]/30'
                      }`}
                    >
                      <span>{f + 1}</span>
                      {marker && (
                        <span
                          title={marker.label}
                          className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: marker.color }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Camera Track Row */}
              {studioMode !== 'beginner' && (
                <div className="h-7 flex border-b border-[var(--studio-border)]/70 relative bg-[var(--studio-bg)]/40">
                  {frames.map((f) => {
                    const hasCamKey = scene.cameraKeyframes.some((k) => k.frame === f);
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => onSeekFrame(f)}
                        style={{ width: cellWidth }}
                        className="shrink-0 h-full border-r border-[var(--studio-border)]/30 flex items-center justify-center"
                      >
                        {hasCamKey && (
                          <span className="w-2.5 h-2.5 rotate-45 bg-[#64D6C5] block" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Cel Layer Rows */}
              {[...scene.layers].reverse().map((layer) => (
                <div
                  key={layer.id}
                  className="h-11 flex border-b border-[var(--studio-border)]/60 relative"
                >
                  {frames.map((f) => {
                    const celStartingHere = layer.cels.find((c) => c.frameIndex === f);
                    const isCovered = Boolean(resolveCelAtFrame(layer, f));
                    const isCurrent = f === currentFrame;
                    return (
                      <div
                        key={f}
                        onClick={() => {
                          onSelectLayer(layer.id);
                          onSeekFrame(f);
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (dragInfo && dragInfo.layerId === layer.id) {
                            onMoveCel(layer.id, dragInfo.celId, f);
                            setDragInfo(null);
                          }
                        }}
                        style={{ width: cellWidth }}
                        className={`shrink-0 h-full border-r border-[var(--studio-border)]/35 relative cursor-pointer ${
                          isCurrent ? 'bg-[#8B7CFF]/12' : ''
                        } ${!celStartingHere && isCovered ? 'bg-[#8B7CFF]/8' : ''}`}
                      >
                        {celStartingHere && (
                          <div
                            draggable
                            onDragStart={() =>
                              setDragInfo({ layerId: layer.id, celId: celStartingHere.id })
                            }
                            style={{
                              width: Math.max(
                                cellWidth - 2,
                                celStartingHere.durationFrames * cellWidth - 2
                              ),
                            }}
                            title={`Drag to move cel (Frame ${f + 1}, ${celStartingHere.durationFrames}f)`}
                            className="absolute top-1 left-[1px] bottom-1 z-[5] rounded bg-[#2A2F3A] border border-[#8B7CFF]/80 overflow-hidden flex items-center px-1 gap-1 shadow-sm"
                          >
                            {thumbnails.get(celStartingHere.id) ? (
                              <img
                                src={thumbnails.get(celStartingHere.id)}
                                alt={`Cel ${f + 1}`}
                                className="h-7 w-10 object-cover rounded-sm shrink-0 pointer-events-none"
                              />
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-[#8B7CFF] shrink-0" />
                            )}
                            {celStartingHere.durationFrames > 1 && (
                              <span className="font-mono text-[9px] text-[#9CA3AF] truncate">
                                {celStartingHere.durationFrames}f
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Audio Track Waveform Rows */}
              {scene.audioTracks.map((track) => (
                <div
                  key={track.id}
                  className="h-9 flex items-center border-b border-[var(--studio-border)]/60 relative bg-[#64D6C5]/5 px-1"
                >
                  <div className="flex items-end gap-[2px] h-6">
                    {track.peaks.map((pk, idx) => (
                      <div
                        key={idx}
                        className="w-1.5 rounded-t bg-[#64D6C5]/75"
                        style={{ height: `${Math.max(15, Math.round(pk * 100))}%` }}
                      />
                    ))}
                  </div>
                  {track.lipSyncMarkers.map((lm) => (
                    <span
                      key={lm.id}
                      style={{ left: lm.frame * cellWidth + 2 }}
                      className="absolute top-0.5 px-1 rounded bg-[#8B7CFF] text-white font-mono text-[9px]"
                    >
                      {lm.mouthShape}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Exposure Sheet (X-Sheet) Mode */}
      {!collapsed && viewMode === 'xsheet' && (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-[var(--studio-panel)] border-b border-[var(--studio-border)] font-mono text-[10px] text-[var(--studio-text-muted)]">
              <tr>
                <th className="py-1.5 px-3 w-16">FRAME</th>
                {scene.layers.map((l) => (
                  <th key={l.id} className="py-1.5 px-3">
                    {l.name}
                  </th>
                ))}
                <th className="py-1.5 px-3">CAMERA / LIP-SYNC</th>
              </tr>
            </thead>
            <tbody>
              {frames.map((f) => {
                const isCurrent = f === currentFrame;
                const cam = scene.cameraKeyframes.find((k) => k.frame === f);
                const lip = scene.audioTracks
                  .flatMap((t) => t.lipSyncMarkers)
                  .find((m) => m.frame === f);
                return (
                  <tr
                    key={f}
                    onClick={() => onSeekFrame(f)}
                    className={`border-b border-[var(--studio-border)]/40 cursor-pointer ${
                      isCurrent ? 'bg-[#8B7CFF]/20' : 'hover:bg-[var(--studio-panel)]'
                    }`}
                  >
                    <td className="py-1 px-3 font-mono tabular-nums font-medium">{f + 1}</td>
                    {scene.layers.map((l) => {
                      const exact = l.cels.find((c) => c.frameIndex === f);
                      const held = resolveCelAtFrame(l, f);
                      return (
                        <td key={l.id} className="py-1 px-3 font-mono text-[11px]">
                          {exact ? (
                            <span className="text-[#8B7CFF] font-semibold">
                              ● {exact.label || `Cel ${f + 1}`}
                            </span>
                          ) : held ? (
                            <span className="text-[var(--studio-text-muted)]">| (Hold)</span>
                          ) : (
                            <span className="opacity-25">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-1 px-3 font-mono text-[11px] text-[#64D6C5]">
                      {cam ? `Cam(${cam.zoom.toFixed(2)}x) ` : ''}
                      {lip ? `Mouth:${lip.mouthShape}` : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
