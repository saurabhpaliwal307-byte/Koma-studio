import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bone as BoneIcon,
  Camera,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Layers as LayersIcon,
  Lock,
  Paintbrush,
  PanelRightClose,
  Plus,
  Scissors,
  Sparkles,
  Trash2,
  Unlock,
  Wand2,
} from 'lucide-react';
import { MOUTH_SHAPES } from '../audio/audioEngine';
import { solveForwardKinematics, solveTwoBoneIK } from '../engine/math';
import { BRUSH_TEXTURE_CATALOG } from '../engine/templates';
import { resolveCelAtFrame, resolveLayerTransformAtFrame } from '../engine/timeline';
import type {
  BlendMode,
  Bone,
  BrushPreset,
  BrushTexture,
  CameraKeyframe,
  CompositeEffect,
  EasingType,
  GuideConfig,
  Layer,
  MouthShapeId,
  ReferenceItem,
  Scene,
  StudioMode,
  SymmetryMode,
  TransformKeyframe,
  VectorStroke,
} from '../engine/types';
import { drawCelContent, drawVectorStroke } from '../canvas/renderer';
import { ColorWheel } from './ColorWheel';

export type InspectorTab = 'layers' | 'brush' | 'rig' | 'camera' | 'ai';

interface RightInspectorProps {
  isOpen: boolean;
  activeTab: InspectorTab;
  studioMode: StudioMode;
  scene: Scene;
  currentFrame: number;
  activeLayerId: string;
  activeColor: string;
  palette: string[];
  recentColors: string[];
  brushPreset: BrushPreset;
  brushPresets: BrushPreset[];
  shapeFill: boolean;
  guides: GuideConfig;
  rotationDeg: number;
  palmRejection: boolean;
  showRigOverlay: boolean;
  rigEditMode: boolean;
  selectedBoneId: string | null;
  onClose: () => void;
  onChangeTab: (tab: InspectorTab) => void;
  onSelectLayer: (id: string) => void;
  onAddLayer: (type: 'cel' | 'background' | 'vfx') => void;
  onDuplicateLayer: (id: string) => void;
  onDeleteLayer: (id: string) => void;
  onMoveLayer: (id: string, dir: -1 | 1) => void;
  onUpdateLayer: (id: string, patch: Partial<Layer>) => void;
  onUpsertLayerKeyframe: (layerId: string, kf: TransformKeyframe) => void;
  onDeleteLayerKeyframe: (layerId: string, frame: number) => void;
  onChangeColor: (hex: string) => void;
  onAddPaletteSwatch: (hex: string) => void;
  onSelectBrushPreset: (preset: BrushPreset) => void;
  onUpdateBrush: (patch: Partial<BrushPreset>) => void;
  onToggleShapeFill: () => void;
  onSaveCustomBrush: (name: string) => void;
  onUpdateGuides: (patch: Partial<GuideConfig>) => void;
  onUpdateScene: (patch: Partial<Scene>) => void;
  onChangeRotation: (deg: number) => void;
  onTogglePalmRejection: () => void;
  onAddReferenceImage: (item: ReferenceItem) => void;
  onUpdateReference: (id: string, patch: Partial<ReferenceItem>) => void;
  onDeleteReference: (id: string) => void;
  onToggleRigOverlay: () => void;
  onToggleRigEditMode: () => void;
  onSelectBone: (id: string | null) => void;
  onUpdateBones: (bones: Bone[]) => void;
  onApplyPose: (poseId: string) => void;
  onSaveCurrentPose: (name: string) => void;
  onTagLipSync: (mouth: MouthShapeId) => void;
  onUpsertCameraKeyframe: (kf: CameraKeyframe) => void;
  onDeleteCameraKeyframe: (frame: number) => void;
  onUpdateEffects: (effects: CompositeEffect[]) => void;
  onInsertAiInbetweenFrames: (frames: VectorStroke[][]) => void;
}

const BrushStrokePreview: React.FC<{ preset: BrushPreset; color: string }> = ({
  preset,
  color,
}) => {
  const previewRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (preset.tool === 'eraser') {
      ctx.fillStyle = '#343943';
      ctx.fillRect(10, 8, w - 20, h - 16);
    }

    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      pts.push({
        x: 16 + t * (w - 32),
        y: h / 2 + Math.sin(t * Math.PI * 2.2) * 11,
        pressure: preset.pressureSize ? 0.25 + Math.sin(t * Math.PI) * 0.75 : 0.765,
      });
    }

    drawVectorStroke(ctx, {
      id: 'preview',
      points: pts,
      color: preset.tool === 'eraser' ? '#FFFFFF' : color,
      size: Math.min(26, preset.size),
      opacity: preset.opacity,
      hardness: preset.hardness,
      texture: preset.texture,
      tool: preset.tool,
    });
  }, [preset, color]);

  return (
    <canvas
      ref={previewRef}
      width={280}
      height={44}
      className="w-full h-11 rounded bg-[var(--studio-bg)] border border-[var(--studio-border)]"
    />
  );
};

export const RightInspector: React.FC<RightInspectorProps> = ({
  isOpen,
  activeTab,
  studioMode,
  scene,
  currentFrame,
  activeLayerId,
  activeColor,
  palette,
  recentColors,
  brushPreset,
  brushPresets,
  shapeFill,
  guides,
  rotationDeg,
  palmRejection,
  showRigOverlay,
  rigEditMode,
  selectedBoneId,
  onClose,
  onChangeTab,
  onSelectLayer,
  onAddLayer,
  onDuplicateLayer,
  onDeleteLayer,
  onMoveLayer,
  onUpdateLayer,
  onUpsertLayerKeyframe,
  onDeleteLayerKeyframe,
  onChangeColor,
  onAddPaletteSwatch,
  onSelectBrushPreset,
  onUpdateBrush,
  onToggleShapeFill,
  onSaveCustomBrush,
  onUpdateGuides,
  onUpdateScene,
  onChangeRotation,
  onTogglePalmRejection,
  onAddReferenceImage,
  onUpdateReference,
  onDeleteReference,
  onToggleRigOverlay,
  onToggleRigEditMode,
  onSelectBone,
  onUpdateBones,
  onApplyPose,
  onSaveCurrentPose,
  onTagLipSync,
  onUpsertCameraKeyframe,
  onDeleteCameraKeyframe,
  onUpdateEffects,
  onInsertAiInbetweenFrames,
}) => {
  const [newBrushName, setNewBrushName] = useState('');
  const [brushFilter, setBrushFilter] = useState<'all' | 'pencil' | 'pen' | 'brush' | 'cloud' | 'fx' | 'eraser'>('all');
  const [newPoseName, setNewPoseName] = useState('');
  const [ikTarget, setIkTarget] = useState({ x: 640, y: 420 });
  const [ikSide, setIkSide] = useState<'left' | 'right'>('left');

  // AI State
  const [aiStatus, setAiStatus] = useState<{ available: boolean; message: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<Record<string, unknown> | null>(null);
  const [aiTaskType, setAiTaskType] = useState<string>('inbetween');
  const [inbetweenCount, setInbetweenCount] = useState(1);

  useEffect(() => {
    if (activeTab === 'ai' && aiStatus === null) {
      fetch('/api/ai/status')
        .then((r) => r.json())
        .then((d) => setAiStatus({ available: Boolean(d.available), message: d.message }))
        .catch(() =>
          setAiStatus({ available: false, message: 'Unable to reach AI backend endpoint.' })
        );
    }
  }, [activeTab, aiStatus]);

  if (!isOpen) return null;

  const activeLayer = scene.layers.find((l) => l.id === activeLayerId) ?? scene.layers[0];
  const selectedBone = scene.rig.bones.find((b) => b.id === selectedBoneId) ?? null;

  const tabs: { id: InspectorTab; label: string; Icon: React.ComponentType<{ className?: string }> }[] =
    studioMode === 'beginner'
      ? [
          { id: 'layers', label: 'Layers', Icon: LayersIcon },
          { id: 'brush', label: 'Brush', Icon: Paintbrush },
        ]
      : [
          { id: 'layers', label: 'Layers', Icon: LayersIcon },
          { id: 'brush', label: 'Brush', Icon: Paintbrush },
          { id: 'rig', label: 'Rig', Icon: BoneIcon },
          { id: 'camera', label: 'FX', Icon: Camera },
          { id: 'ai', label: 'AI', Icon: Sparkles },
        ];

  const handleUploadReference = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onAddReferenceImage({
        id: `ref-${Date.now()}`,
        name: file.name,
        dataUrl: String(reader.result),
        x: 60,
        y: 60,
        width: Math.round(scene.width * 0.28),
        height: Math.round(scene.height * 0.36),
        opacity: 0.65,
        visible: true,
        category: 'model-sheet',
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const renderLayerCelToDataUrl = (celIndex: number): string | null => {
    if (!activeLayer || !activeLayer.cels[celIndex]) return null;
    const off = document.createElement('canvas');
    off.width = scene.width;
    off.height = scene.height;
    const ctx = off.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = scene.bgColor || '#1B1E26';
    ctx.fillRect(0, 0, scene.width, scene.height);
    drawCelContent(ctx, activeLayer.cels[celIndex]);
    return off.toDataURL('image/png');
  };

  const runAiTask = async (
    task: 'inbetween' | 'smart-color' | 'line-art' | 'consistency' | 'timing'
  ) => {
    setAiTaskType(task);
    setAiBusy(true);
    setAiError(null);
    setAiResult(null);

    try {
      const payload: Record<string, unknown> = {};
      if (task === 'inbetween') {
        const cels = [...(activeLayer?.cels ?? [])].sort((a, b) => a.frameIndex - b.frameIndex);
        if (cels.length < 2) {
          throw new Error('Add at least 2 cel drawings on the active layer to generate in-betweens.');
        }
        payload.startImageDataUrl = renderLayerCelToDataUrl(0);
        payload.endImageDataUrl = renderLayerCelToDataUrl(1);
        payload.count = inbetweenCount;
        payload.width = scene.width;
        payload.height = scene.height;
      } else if (task === 'smart-color' || task === 'line-art') {
        const celIdx = activeLayer
          ? activeLayer.cels.findIndex(
              (c) =>
                currentFrame >= c.frameIndex &&
                currentFrame < c.frameIndex + Math.max(1, c.durationFrames)
            )
          : -1;
        payload.frameImageDataUrl = renderLayerCelToDataUrl(Math.max(0, celIdx));
        payload.palette = palette;
      } else if (task === 'consistency') {
        if (scene.references.length === 0) {
          throw new Error('Upload a character reference sheet in the Layers tab first.');
        }
        payload.frameImageDataUrl = renderLayerCelToDataUrl(0);
        payload.referenceImageDataUrl = scene.references[0].dataUrl;
      } else if (task === 'timing') {
        payload.fps = scene.fps;
        payload.totalFrames = scene.totalFrames;
        payload.markers = scene.markers;
        payload.cels = activeLayer?.cels.map((c) => ({
          frameIndex: c.frameIndex,
          durationFrames: c.durationFrames,
          label: c.label,
          strokeCount: c.strokes.length,
        }));
      }

      const res = await fetch('/api/ai/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'AI assistant request failed');
      }
      setAiResult(data);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI request error');
    } finally {
      setAiBusy(false);
    }
  };

  const applyCameraPreset = (preset: 'reset' | 'push' | 'dutch' | 'shake') => {
    const base: CameraKeyframe = {
      id: `cam-${currentFrame}`,
      frame: currentFrame,
      x: 0,
      y: 0,
      zoom: 1,
      rotation: 0,
      shake: 0,
      easing: 'ease-in-out',
    };
    if (preset === 'push') {
      base.zoom = 1.25;
      base.y = -20;
    } else if (preset === 'dutch') {
      base.zoom = 1.1;
      base.rotation = -8;
    } else if (preset === 'shake') {
      base.zoom = 1.06;
      base.shake = 14;
    }
    onUpsertCameraKeyframe(base);
  };

  return (
    <aside
      aria-label="Studio Inspector Sidebar"
      className="fixed inset-y-12 right-0 z-30 w-80 lg:static lg:z-auto lg:w-[340px] shrink-0 lg:h-full flex flex-col bg-[var(--studio-surface)] border-l border-[var(--studio-border)] shadow-2xl lg:shadow-none select-none overflow-hidden"
    >
      {/* Inspector Tab Header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-[var(--studio-border)] bg-[var(--studio-panel)]">
        <div role="tablist" aria-label="Inspector Sections" className="flex items-center gap-0.5">
          {tabs.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => onChangeTab(id)}
                className={`flex items-center gap-1 px-1.5 py-1 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-[#8B7CFF] text-white'
                    : 'text-[var(--studio-text-muted)] hover:text-[var(--studio-text)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Collapse Inspector"
          className="p-1 rounded text-[var(--studio-text-muted)] hover:text-[var(--studio-text)]"
        >
          <PanelRightClose className="w-4 h-4" />
        </button>
      </div>

      {/* Inspector Scroll Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
        {activeTab === 'layers' && (
          <>
            {/* Layers Header */}
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold text-xs text-[var(--studio-text)]">
                Layers ({scene.layers.length})
              </h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onAddLayer('cel')}
                  aria-label="Add Cel Layer"
                  className="flex items-center gap-1 px-2 py-1 rounded bg-[#8B7CFF] text-white text-[11px] font-medium hover:bg-[#7A6AEF]"
                >
                  <Plus className="w-3 h-3" /> Cel
                </button>
                {studioMode !== 'beginner' && (
                  <button
                    type="button"
                    onClick={() => onAddLayer('vfx')}
                    aria-label="Add VFX Layer"
                    className="px-2 py-1 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] text-[11px] text-[var(--studio-text)] hover:border-[#64D6C5]"
                  >
                    + VFX
                  </button>
                )}
              </div>
            </div>

            {/* Layer Stack (Top-most rendered last, displayed top-first) */}
            <div className="space-y-1.5">
              {[...scene.layers].reverse().map((layer) => {
                const isSelected = layer.id === activeLayer?.id;
                const celNow = resolveCelAtFrame(layer, currentFrame);
                return (
                  <div
                    key={layer.id}
                    onClick={() => onSelectLayer(layer.id)}
                    className={`p-2 rounded border cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#8B7CFF]/12 border-[#8B7CFF]'
                        : 'bg-[var(--studio-panel)] border-[var(--studio-border)] hover:border-[var(--studio-text-muted)]/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateLayer(layer.id, { visible: !layer.visible });
                          }}
                          aria-label={`Toggle Visibility for ${layer.name}`}
                          className="p-0.5 text-[var(--studio-text-muted)] hover:text-[var(--studio-text)]"
                        >
                          {layer.visible ? (
                            <Eye className="w-3.5 h-3.5 text-[#64D6C5]" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 opacity-45" />
                          )}
                        </button>
                        <input
                          type="text"
                          value={layer.name}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => onUpdateLayer(layer.id, { name: e.target.value })}
                          aria-label="Layer Name"
                          className="bg-transparent font-medium text-xs text-[var(--studio-text)] outline-none truncate w-28"
                        />
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        {layer.clippingMask && (
                          <span className="text-[10px] text-[#64D6C5] px-1">Clip</span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateLayer(layer.id, { locked: !layer.locked });
                          }}
                          aria-label={`Toggle Lock for ${layer.name}`}
                          className="p-1 text-[var(--studio-text-muted)] hover:text-[var(--studio-text)]"
                        >
                          {layer.locked ? (
                            <Lock className="w-3 h-3 text-amber-400" />
                          ) : (
                            <Unlock className="w-3 h-3 opacity-60" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDuplicateLayer(layer.id);
                          }}
                          aria-label={`Duplicate ${layer.name}`}
                          className="p-1 text-[var(--studio-text-muted)] hover:text-[var(--studio-text)]"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteLayer(layer.id);
                          }}
                          disabled={scene.layers.length <= 1}
                          aria-label={`Delete ${layer.name}`}
                          className="p-1 text-[var(--studio-text-muted)] hover:text-rose-400 disabled:opacity-30"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="mt-2 pt-2 border-t border-[var(--studio-border)]/70 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-[var(--studio-text-muted)]">
                            Opacity {Math.round(layer.opacity * 100)}%
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onMoveLayer(layer.id, 1);
                              }}
                              aria-label="Move Layer Up"
                              className="p-0.5 rounded hover:bg-[var(--studio-border)]/40"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onMoveLayer(layer.id, -1);
                              }}
                              aria-label="Move Layer Down"
                              className="p-0.5 rounded hover:bg-[var(--studio-border)]/40"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.02}
                          value={layer.opacity}
                          aria-label="Layer Opacity"
                          onChange={(e) =>
                            onUpdateLayer(layer.id, { opacity: Number(e.target.value) })
                          }
                          className="w-full accent-[#8B7CFF]"
                        />

                        {studioMode !== 'beginner' && (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] text-[var(--studio-text-muted)] mb-0.5">
                                Blend Mode
                              </label>
                              <select
                                value={layer.blendMode}
                                aria-label="Layer Blend Mode"
                                onChange={(e) =>
                                  onUpdateLayer(layer.id, {
                                    blendMode: e.target.value as BlendMode,
                                  })
                                }
                                className="w-full px-1.5 py-1 rounded bg-[var(--studio-bg)] border border-[var(--studio-border)] text-[11px]"
                              >
                                <option value="normal">Normal</option>
                                <option value="multiply">Multiply</option>
                                <option value="screen">Screen</option>
                                <option value="overlay">Overlay</option>
                                <option value="lighter">Add / Glow</option>
                                <option value="darken">Darken</option>
                                <option value="lighten">Lighten</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] text-[var(--studio-text-muted)] mb-0.5">
                                Parallax ({layer.parallaxDepth.toFixed(2)}x)
                              </label>
                              <input
                                type="range"
                                min={0.2}
                                max={1.6}
                                step={0.05}
                                value={layer.parallaxDepth}
                                aria-label="Layer Parallax Depth"
                                onChange={(e) =>
                                  onUpdateLayer(layer.id, {
                                    parallaxDepth: Number(e.target.value),
                                  })
                                }
                                className="w-full accent-[#64D6C5]"
                              />
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[11px]">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onUpdateLayer(layer.id, { clippingMask: !layer.clippingMask });
                            }}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded border ${
                              layer.clippingMask
                                ? 'border-[#64D6C5] text-[#64D6C5] bg-[#64D6C5]/10'
                                : 'border-[var(--studio-border)] text-[var(--studio-text-muted)]'
                            }`}
                          >
                            <Scissors className="w-3 h-3" /> Clipping Mask
                          </button>
                          <span className="font-mono tabular-nums text-[10px] text-[var(--studio-text-muted)]">
                            {celNow ? `${celNow.strokes.length} strokes` : 'Empty frame'}
                          </span>
                        </div>

                        {studioMode !== 'beginner' && (() => {
                          const tf = resolveLayerTransformAtFrame(layer.keyframes, currentFrame);
                          const exactKf = layer.keyframes.find((k) => k.frame === currentFrame);
                          const upsert = (patch: Partial<TransformKeyframe>) =>
                            onUpsertLayerKeyframe(layer.id, {
                              id: exactKf?.id ?? `tf-${currentFrame}`,
                              frame: currentFrame,
                              x: tf.x,
                              y: tf.y,
                              scaleX: tf.scaleX,
                              scaleY: tf.scaleY,
                              rotation: tf.rotation,
                              opacity: tf.opacity,
                              easing: exactKf?.easing ?? 'ease-in-out',
                              ...patch,
                            });
                          return (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="mt-2 pt-2 border-t border-[var(--studio-border)]/70 space-y-1.5"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-semibold text-[#64D6C5]">
                                  Motion Tween (F{currentFrame + 1})
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => upsert({})}
                                    className="px-1.5 py-0.5 rounded bg-[#8B7CFF]/20 text-[#8B7CFF] text-[10px] font-medium"
                                  >
                                    {exactKf ? 'Keyed' : '+ Key'}
                                  </button>
                                  {exactKf && (
                                    <button
                                      type="button"
                                      onClick={() => onDeleteLayerKeyframe(layer.id, currentFrame)}
                                      className="px-1.5 py-0.5 rounded text-rose-400 hover:bg-rose-500/15 text-[10px]"
                                    >
                                      Del
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <div className="flex justify-between text-[10px] text-[var(--studio-text-muted)]">
                                    <span>X</span>
                                    <span className="font-mono tabular-nums">{Math.round(tf.x)}</span>
                                  </div>
                                  <input
                                    type="range"
                                    min={-360}
                                    max={360}
                                    value={tf.x}
                                    onChange={(e) => upsert({ x: Number(e.target.value) })}
                                    aria-label="Layer Keyframe X"
                                    className="w-full accent-[#8B7CFF]"
                                  />
                                </div>
                                <div>
                                  <div className="flex justify-between text-[10px] text-[var(--studio-text-muted)]">
                                    <span>Y</span>
                                    <span className="font-mono tabular-nums">{Math.round(tf.y)}</span>
                                  </div>
                                  <input
                                    type="range"
                                    min={-280}
                                    max={280}
                                    value={tf.y}
                                    onChange={(e) => upsert({ y: Number(e.target.value) })}
                                    aria-label="Layer Keyframe Y"
                                    className="w-full accent-[#8B7CFF]"
                                  />
                                </div>
                                <div>
                                  <div className="flex justify-between text-[10px] text-[var(--studio-text-muted)]">
                                    <span>Scale</span>
                                    <span className="font-mono tabular-nums">{tf.scaleX.toFixed(2)}x</span>
                                  </div>
                                  <input
                                    type="range"
                                    min={0.2}
                                    max={2.4}
                                    step={0.05}
                                    value={tf.scaleX}
                                    onChange={(e) => {
                                      const s = Number(e.target.value);
                                      upsert({ scaleX: s, scaleY: s });
                                    }}
                                    aria-label="Layer Keyframe Scale"
                                    className="w-full accent-[#64D6C5]"
                                  />
                                </div>
                                <div>
                                  <div className="flex justify-between text-[10px] text-[var(--studio-text-muted)]">
                                    <span>Rotate</span>
                                    <span className="font-mono tabular-nums">{Math.round(tf.rotation)}°</span>
                                  </div>
                                  <input
                                    type="range"
                                    min={-180}
                                    max={180}
                                    value={tf.rotation}
                                    onChange={(e) => upsert({ rotation: Number(e.target.value) })}
                                    aria-label="Layer Keyframe Rotation"
                                    className="w-full accent-[#64D6C5]"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Canvas Guides & Stage Settings */}
            <div className="pt-3 border-t border-[var(--studio-border)] space-y-2.5">
              <h3 className="font-display font-semibold text-xs text-[var(--studio-text)]">
                Stage Guides & Input
              </h3>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onUpdateGuides({ grid: !guides.grid })}
                  className={`px-2 py-1.5 rounded border text-[11px] font-medium ${
                    guides.grid
                      ? 'bg-[#8B7CFF]/15 border-[#8B7CFF] text-[#8B7CFF]'
                      : 'bg-[var(--studio-panel)] border-[var(--studio-border)] text-[var(--studio-text-muted)]'
                  }`}
                >
                  Grid Guide
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateGuides({ perspective: !guides.perspective })}
                  className={`px-2 py-1.5 rounded border text-[11px] font-medium ${
                    guides.perspective
                      ? 'bg-[#64D6C5]/15 border-[#64D6C5] text-[#64D6C5]'
                      : 'bg-[var(--studio-panel)] border-[var(--studio-border)] text-[var(--studio-text-muted)]'
                  }`}
                >
                  2-Pt Perspective
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateGuides({ safeArea: !guides.safeArea })}
                  className={`px-2 py-1.5 rounded border text-[11px] font-medium ${
                    guides.safeArea
                      ? 'bg-[#8B7CFF]/15 border-[#8B7CFF] text-[#8B7CFF]'
                      : 'bg-[var(--studio-panel)] border-[var(--studio-border)] text-[var(--studio-text-muted)]'
                  }`}
                >
                  TV Safe Area
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateScene({ transparentBg: !scene.transparentBg })}
                  className={`px-2 py-1.5 rounded border text-[11px] font-medium ${
                    scene.transparentBg
                      ? 'bg-[#64D6C5]/15 border-[#64D6C5] text-[#64D6C5]'
                      : 'bg-[var(--studio-panel)] border-[var(--studio-border)] text-[var(--studio-text-muted)]'
                  }`}
                >
                  Alpha Canvas
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-[var(--studio-text-muted)] mb-1">
                    Symmetry
                  </label>
                  <select
                    value={guides.symmetry}
                    aria-label="Drawing Symmetry Mode"
                    onChange={(e) =>
                      onUpdateGuides({ symmetry: e.target.value as SymmetryMode })
                    }
                    className="w-full px-2 py-1 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] text-[11px]"
                  >
                    <option value="none">Off</option>
                    <option value="vertical">Vertical Mirror</option>
                    <option value="horizontal">Horizontal Mirror</option>
                    <option value="quad">Quad Mirror</option>
                    <option value="radial">Radial Mandala</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-[var(--studio-text-muted)] mb-1">
                    Rotate Canvas ({rotationDeg}°)
                  </label>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    step={5}
                    value={rotationDeg}
                    aria-label="Canvas Rotation"
                    onChange={(e) => onChangeRotation(Number(e.target.value))}
                    className="w-full accent-[#8B7CFF]"
                  />
                </div>
              </div>

              <label className="flex items-center justify-between pt-1 cursor-pointer">
                <span className="text-[11px] text-[var(--studio-text-muted)]">
                  Stylus Palm Rejection
                </span>
                <input
                  type="checkbox"
                  checked={palmRejection}
                  onChange={onTogglePalmRejection}
                  className="accent-[#8B7CFF]"
                />
              </label>
            </div>

            {/* Reference Board */}
            <div className="pt-3 border-t border-[var(--studio-border)] space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-semibold text-xs text-[var(--studio-text)]">
                  Reference Board ({scene.references.length})
                </h3>
                <label className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] text-[11px] cursor-pointer hover:border-[#8B7CFF]">
                  <ImageIcon className="w-3 h-3 text-[#8B7CFF]" />
                  <span>Add Ref</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUploadReference}
                    className="hidden"
                  />
                </label>
              </div>
              {scene.references.map((ref) => (
                <div
                  key={ref.id}
                  className="flex items-center justify-between gap-2 p-1.5 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)]"
                >
                  <span className="truncate text-[11px] flex-1">{ref.name}</span>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={ref.opacity}
                    onChange={(e) =>
                      onUpdateReference(ref.id, { opacity: Number(e.target.value) })
                    }
                    className="w-16 accent-[#64D6C5]"
                    aria-label={`Reference opacity for ${ref.name}`}
                  />
                  <button
                    type="button"
                    onClick={() => onUpdateReference(ref.id, { visible: !ref.visible })}
                    aria-label={`Toggle ${ref.name}`}
                    className="p-0.5"
                  >
                    {ref.visible ? (
                      <Eye className="w-3.5 h-3.5 text-[#64D6C5]" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5 opacity-45" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteReference(ref.id)}
                    aria-label={`Remove ${ref.name}`}
                    className="p-0.5 hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === 'brush' && (
          <>
            <div className="space-y-2">
              <h2 className="font-display font-semibold text-xs text-[var(--studio-text)]">
                Color & Palette
              </h2>
              <ColorWheel
                color={activeColor}
                palette={palette}
                recentColors={recentColors}
                onChangeColor={onChangeColor}
                onAddPaletteSwatch={onAddPaletteSwatch}
              />
            </div>

            <div className="pt-3 border-t border-[var(--studio-border)] space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-semibold text-xs text-[var(--studio-text)]">
                  Brush Engine ({brushPresets.length})
                </h3>
                <span className="font-mono text-[10px] text-[#64D6C5]">{brushPreset.texture}</span>
              </div>

              <BrushStrokePreview preset={brushPreset} color={activeColor} />

              {/* Category Filter */}
              <div className="flex flex-wrap items-center bg-[var(--studio-bg)] border border-[var(--studio-border)] rounded p-0.5 gap-0.5">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'pencil', label: 'Pencil' },
                    { id: 'pen', label: 'Pen' },
                    { id: 'brush', label: 'Paint' },
                    { id: 'cloud', label: 'Clouds' },
                    { id: 'fx', label: 'FX/Tone' },
                    { id: 'eraser', label: 'Eraser' },
                  ] as const
                ).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setBrushFilter(cat.id)}
                    className={`flex-1 min-w-[42px] px-1 py-0.5 rounded text-[10px] font-medium transition-colors whitespace-nowrap ${
                      brushFilter === cat.id
                        ? 'bg-[#8B7CFF] text-white'
                        : 'text-[var(--studio-text-muted)] hover:text-[var(--studio-text)]'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-1.5 max-h-52 overflow-y-auto pr-0.5">
                {brushPresets
                  .filter((p) => {
                    if (brushFilter === 'all') return true;
                    const fxTextures: BrushTexture[] = [
                      'pixel',
                      'halftone',
                      'crosshatch',
                      'fur',
                      'spray',
                      'glow',
                      'sparkle',
                      'ribbon',
                    ];
                    if (brushFilter === 'cloud') return p.texture.startsWith('cloud-');
                    if (brushFilter === 'fx') return fxTextures.includes(p.texture);
                    if (brushFilter === 'brush') {
                      return (
                        p.tool === 'brush' &&
                        !p.texture.startsWith('cloud-') &&
                        !fxTextures.includes(p.texture)
                      );
                    }
                    return p.tool === brushFilter;
                  })
                  .map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onSelectBrushPreset(preset)}
                      className={`px-2 py-1.5 rounded border text-left text-[11px] transition-colors ${
                        brushPreset.id === preset.id
                          ? 'bg-[#8B7CFF]/15 border-[#8B7CFF] text-[var(--studio-text)] font-medium'
                          : 'bg-[var(--studio-panel)] border-[var(--studio-border)] text-[var(--studio-text-muted)] hover:border-[var(--studio-text-muted)]/60'
                      }`}
                    >
                      <div className="truncate">{preset.name}</div>
                      <div className="text-[9px] opacity-65 truncate">
                        {preset.texture} · {preset.size}px
                      </div>
                    </button>
                  ))}
              </div>

              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-[11px] text-[var(--studio-text-muted)]">
                    <span>Brush Size</span>
                    <span className="font-mono tabular-nums">{brushPreset.size} px</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={80}
                    value={brushPreset.size}
                    onChange={(e) => onUpdateBrush({ size: Number(e.target.value) })}
                    className="w-full accent-[#8B7CFF]"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-[var(--studio-text-muted)]">
                    <span>Opacity</span>
                    <span className="font-mono tabular-nums">
                      {Math.round(brushPreset.opacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={brushPreset.opacity}
                    onChange={(e) => onUpdateBrush({ opacity: Number(e.target.value) })}
                    className="w-full accent-[#8B7CFF]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex justify-between text-[10px] text-[var(--studio-text-muted)]">
                      <span>Hardness</span>
                      <span className="font-mono tabular-nums">
                        {Math.round(brushPreset.hardness * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.05}
                      max={1}
                      step={0.05}
                      value={brushPreset.hardness}
                      onChange={(e) => onUpdateBrush({ hardness: Number(e.target.value) })}
                      className="w-full accent-[#8B7CFF]"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-[var(--studio-text-muted)]">
                      <span>Stabilizer</span>
                      <span className="font-mono tabular-nums">{brushPreset.stabilization}/10</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={1}
                      value={brushPreset.stabilization}
                      onChange={(e) => onUpdateBrush({ stabilization: Number(e.target.value) })}
                      className="w-full accent-[#64D6C5]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--studio-text-muted)] mb-1">
                    Brush Tip & Texture ({BRUSH_TEXTURE_CATALOG.length} types)
                  </label>
                  <select
                    value={brushPreset.texture}
                    aria-label="Brush Texture Type"
                    onChange={(e) =>
                      onUpdateBrush({ texture: e.target.value as BrushTexture })
                    }
                    className="w-full px-2 py-1 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] text-[11px]"
                  >
                    {(['Sketch', 'Ink', 'Paint', 'Cloud', 'Pattern', 'FX'] as const).map((group) => (
                      <optgroup key={group} label={group}>
                        {BRUSH_TEXTURE_CATALOG.filter((item) => item.group === group).map(
                          (item) => (
                            <option key={item.id} value={item.id}>
                              {item.label}
                            </option>
                          )
                        )}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-1.5 pt-0.5 text-[11px]">
                  <label className="flex items-center justify-between px-2 py-1 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] cursor-pointer">
                    <span>Pressure Size</span>
                    <input
                      type="checkbox"
                      checked={brushPreset.pressureSize}
                      onChange={(e) => onUpdateBrush({ pressureSize: e.target.checked })}
                      className="accent-[#8B7CFF]"
                    />
                  </label>
                  <label className="flex items-center justify-between px-2 py-1 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] cursor-pointer">
                    <span>Pressure Alpha</span>
                    <input
                      type="checkbox"
                      checked={brushPreset.pressureOpacity}
                      onChange={(e) => onUpdateBrush({ pressureOpacity: e.target.checked })}
                      className="accent-[#64D6C5]"
                    />
                  </label>
                </div>

                <label className="flex items-center justify-between px-2 py-1 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] text-[11px] cursor-pointer">
                  <span>Fill Shapes (Rect / Ellipse)</span>
                  <input
                    type="checkbox"
                    checked={shapeFill}
                    onChange={onToggleShapeFill}
                    className="accent-[#8B7CFF]"
                  />
                </label>
              </div>

              <div className="flex items-center gap-1.5 pt-1">
                <input
                  type="text"
                  value={newBrushName}
                  onChange={(e) => setNewBrushName(e.target.value)}
                  placeholder="Custom brush name..."
                  className="flex-1 px-2 py-1 rounded bg-[var(--studio-bg)] border border-[var(--studio-border)] text-[11px]"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newBrushName.trim()) {
                      onSaveCustomBrush(newBrushName.trim());
                      setNewBrushName('');
                    }
                  }}
                  className="px-2 py-1 rounded bg-[#64D6C5] text-[#111827] text-[11px] font-semibold"
                >
                  Save
                </button>
              </div>
            </div>
          </>
        )}

        {activeTab === 'rig' && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold text-xs text-[var(--studio-text)]">
                Character Rigging (FK / IK)
              </h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onToggleRigOverlay}
                  className={`px-2 py-1 rounded text-[11px] font-medium border ${
                    showRigOverlay
                      ? 'bg-[#64D6C5]/15 border-[#64D6C5] text-[#64D6C5]'
                      : 'border-[var(--studio-border)] text-[var(--studio-text-muted)]'
                  }`}
                >
                  {showRigOverlay ? 'Hide Rig' : 'Show Rig'}
                </button>
                <button
                  type="button"
                  onClick={onToggleRigEditMode}
                  className={`px-2 py-1 rounded text-[11px] font-medium border ${
                    rigEditMode
                      ? 'bg-[#8B7CFF] border-[#8B7CFF] text-white'
                      : 'border-[var(--studio-border)] text-[var(--studio-text-muted)]'
                  }`}
                >
                  {rigEditMode ? 'Posing ON' : 'Pose Mode'}
                </button>
              </div>
            </div>

            {/* Bone Hierarchy */}
            <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
              {scene.rig.bones.map((bone) => (
                <button
                  key={bone.id}
                  type="button"
                  onClick={() => onSelectBone(bone.id)}
                  className={`w-full flex items-center justify-between px-2 py-1 rounded border text-[11px] ${
                    selectedBoneId === bone.id
                      ? 'bg-[#8B7CFF]/15 border-[#8B7CFF] text-[var(--studio-text)]'
                      : 'bg-[var(--studio-panel)] border-[var(--studio-border)] text-[var(--studio-text-muted)]'
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    {bone.parentId && <ChevronRight className="w-3 h-3 opacity-50" />}
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: bone.color }}
                    />
                    <span className="truncate">{bone.name}</span>
                  </span>
                  <span className="font-mono tabular-nums text-[10px]">
                    {Math.round(bone.angle)}°
                  </span>
                </button>
              ))}
            </div>

            {selectedBone && (
              <div className="p-2 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[11px]">{selectedBone.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const newBone: Bone = {
                        id: `bone-${Date.now()}`,
                        name: `${selectedBone.name} Child`,
                        parentId: selectedBone.id,
                        x: 0,
                        y: 0,
                        length: 42,
                        angle: 20,
                        color: '#64D6C5',
                      };
                      onUpdateBones([...scene.rig.bones, newBone]);
                    }}
                    className="text-[10px] text-[#64D6C5] hover:underline"
                  >
                    + Add Child Bone
                  </button>
                </div>
                <div>
                  <label className="block text-[10px] text-[var(--studio-text-muted)]">
                    FK Rotation ({Math.round(selectedBone.angle)}°)
                  </label>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={selectedBone.angle}
                    onChange={(e) =>
                      onUpdateBones(
                        scene.rig.bones.map((b) =>
                          b.id === selectedBone.id ? { ...b, angle: Number(e.target.value) } : b
                        )
                      )
                    }
                    className="w-full accent-[#8B7CFF]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[var(--studio-text-muted)] mb-0.5">
                    Bind Layer to Bone
                  </label>
                  <select
                    value={selectedBone.boundLayerId ?? ''}
                    aria-label="Bind Layer to Bone"
                    onChange={(e) =>
                      onUpdateBones(
                        scene.rig.bones.map((b) =>
                          b.id === selectedBone.id
                            ? { ...b, boundLayerId: e.target.value || undefined }
                            : b
                        )
                      )
                    }
                    className="w-full px-1.5 py-1 rounded bg-[var(--studio-bg)] border border-[var(--studio-border)] text-[11px]"
                  >
                    <option value="">None (Unbound)</option>
                    {scene.layers.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* 2-Bone IK Target Solver */}
            <div className="p-2 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] space-y-2">
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium">2-Bone IK</span>
                  <select
                    value={ikSide}
                    onChange={(e) => setIkSide(e.target.value as 'left' | 'right')}
                    aria-label="IK Limb Side"
                    className="bg-[var(--studio-bg)] border border-[var(--studio-border)] rounded px-1 py-0.5 text-[10px]"
                  >
                    <option value="left">L Arm</option>
                    <option value="right">R Arm</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const upId = ikSide === 'left' ? 'bone-arm-l-up' : 'bone-arm-r-up';
                    const lowId = ikSide === 'left' ? 'bone-arm-l-low' : 'bone-arm-r-low';
                    const up = scene.rig.bones.find((b) => b.id === upId);
                    const low = scene.rig.bones.find((b) => b.id === lowId);
                    if (!up || !low) return;
                    const world = solveForwardKinematics(scene.rig.bones);
                    const wbUp = world[up.id];
                    const parentWorldAngle =
                      up.parentId && world[up.parentId] ? world[up.parentId].worldAngle : 0;
                    if (!wbUp) return;
                    const { angle1Local, angle2Local } = solveTwoBoneIK(
                      wbUp.startX,
                      wbUp.startY,
                      parentWorldAngle,
                      up.length,
                      low.length,
                      ikTarget.x,
                      ikTarget.y,
                      ikSide === 'left' ? 1 : -1
                    );
                    onUpdateBones(
                      scene.rig.bones.map((b) =>
                        b.id === up.id
                          ? { ...b, angle: angle1Local }
                          : b.id === low.id
                          ? { ...b, angle: angle2Local }
                          : b
                      )
                    );
                  }}
                  className="px-2 py-0.5 rounded bg-[#8B7CFF] text-white text-[10px] font-medium"
                >
                  Solve IK
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  value={ikTarget.x}
                  onChange={(e) => setIkTarget({ ...ikTarget, x: Number(e.target.value) })}
                  aria-label="IK Target X"
                  className="px-2 py-1 rounded bg-[var(--studio-bg)] border border-[var(--studio-border)] font-mono text-[11px]"
                />
                <input
                  type="number"
                  value={ikTarget.y}
                  onChange={(e) => setIkTarget({ ...ikTarget, y: Number(e.target.value) })}
                  aria-label="IK Target Y"
                  className="px-2 py-1 rounded bg-[var(--studio-bg)] border border-[var(--studio-border)] font-mono text-[11px]"
                />
              </div>
            </div>

            {/* Pose Presets */}
            <div className="pt-2 border-t border-[var(--studio-border)] space-y-2">
              <h3 className="font-display font-semibold text-xs text-[var(--studio-text)]">
                Pose Library
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {scene.rig.poses.map((pose) => (
                  <button
                    key={pose.id}
                    type="button"
                    onClick={() => onApplyPose(pose.id)}
                    className="px-2 py-1 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] hover:border-[#8B7CFF] text-[11px]"
                  >
                    {pose.name}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newPoseName}
                  onChange={(e) => setNewPoseName(e.target.value)}
                  placeholder="Save pose name..."
                  className="flex-1 px-2 py-1 rounded bg-[var(--studio-bg)] border border-[var(--studio-border)] text-[11px]"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newPoseName.trim()) {
                      onSaveCurrentPose(newPoseName.trim());
                      setNewPoseName('');
                    }
                  }}
                  className="px-2 py-1 rounded bg-[#64D6C5] text-[#111827] text-[11px] font-semibold"
                >
                  Save
                </button>
              </div>
            </div>

            {/* Mouth Shape & Lip-Sync Library */}
            <div className="pt-2 border-t border-[var(--studio-border)] space-y-2">
              <h3 className="font-display font-semibold text-xs text-[var(--studio-text)]">
                Lip-Sync Mouth Library (Tag Frame {currentFrame + 1})
              </h3>
              <div className="grid grid-cols-5 gap-1.5">
                {MOUTH_SHAPES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onTagLipSync(m.id)}
                    title={`${m.label} — ${m.phoneme}`}
                    aria-label={`Tag Mouth Shape ${m.label}`}
                    className="flex flex-col items-center p-1 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] hover:border-[#64D6C5]"
                  >
                    <svg viewBox="0 0 40 34" className="w-8 h-6">
                      <path
                        d={m.path}
                        fill={m.id === 'REST' || m.id === 'M_B_P' ? 'none' : '#8B7CFF'}
                        stroke="#F3F4F6"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="font-mono text-[9px] text-[var(--studio-text-muted)]">
                      {m.id}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {activeTab === 'camera' && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-semibold text-xs text-[var(--studio-text)]">
                  2D Camera & Multiplane
                </h2>
                <button
                  type="button"
                  onClick={() => applyCameraPreset('reset')}
                  className="text-[11px] text-[#64D6C5] hover:underline"
                >
                  Key Frame {currentFrame + 1}
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1">
                <button
                  type="button"
                  onClick={() => applyCameraPreset('reset')}
                  className="px-1.5 py-1 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] text-[10px]"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => applyCameraPreset('push')}
                  className="px-1.5 py-1 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] text-[10px]"
                >
                  Push-In
                </button>
                <button
                  type="button"
                  onClick={() => applyCameraPreset('dutch')}
                  className="px-1.5 py-1 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] text-[10px]"
                >
                  Dutch Tilt
                </button>
                <button
                  type="button"
                  onClick={() => applyCameraPreset('shake')}
                  className="px-1.5 py-1 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] text-[10px]"
                >
                  Impact
                </button>
              </div>

              {(() => {
                const exactCam = scene.cameraKeyframes.find((k) => k.frame === currentFrame);
                const kf =
                  exactCam ??
                  scene.cameraKeyframes[0] ?? {
                    id: `cam-${currentFrame}`,
                    frame: currentFrame,
                    x: 0,
                    y: 0,
                    zoom: 1,
                    rotation: 0,
                    shake: 0,
                    easing: 'ease-in-out' as const,
                  };
                const upsertCam = (patch: Partial<CameraKeyframe>) =>
                  onUpsertCameraKeyframe({
                    ...kf,
                    id: `cam-${currentFrame}`,
                    frame: currentFrame,
                    ...patch,
                  });
                return (
                  <div className="space-y-1.5 p-2 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)]">
                    <div className="flex justify-between text-[11px]">
                      <span>Camera Zoom</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono tabular-nums">{kf.zoom.toFixed(2)}x</span>
                        {exactCam && currentFrame > 0 && (
                          <button
                            type="button"
                            onClick={() => onDeleteCameraKeyframe(currentFrame)}
                            className="text-[10px] text-rose-400 hover:underline"
                          >
                            Del Key
                          </button>
                        )}
                      </div>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={2.5}
                      step={0.02}
                      value={kf.zoom}
                      onChange={(e) => upsertCam({ zoom: Number(e.target.value) })}
                      className="w-full accent-[#8B7CFF]"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="flex justify-between text-[10px] text-[var(--studio-text-muted)]">
                          <span>Pan X</span>
                          <span className="font-mono tabular-nums">{Math.round(kf.x)}px</span>
                        </div>
                        <input
                          type="range"
                          min={-300}
                          max={300}
                          value={kf.x}
                          onChange={(e) => upsertCam({ x: Number(e.target.value) })}
                          className="w-full accent-[#64D6C5]"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[10px] text-[var(--studio-text-muted)]">
                          <span>Pan Y</span>
                          <span className="font-mono tabular-nums">{Math.round(kf.y)}px</span>
                        </div>
                        <input
                          type="range"
                          min={-240}
                          max={240}
                          value={kf.y}
                          onChange={(e) => upsertCam({ y: Number(e.target.value) })}
                          className="w-full accent-[#64D6C5]"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[10px] text-[var(--studio-text-muted)]">
                          <span>Rotation</span>
                          <span className="font-mono tabular-nums">{Math.round(kf.rotation)}°</span>
                        </div>
                        <input
                          type="range"
                          min={-45}
                          max={45}
                          step={0.5}
                          value={kf.rotation}
                          onChange={(e) => upsertCam({ rotation: Number(e.target.value) })}
                          className="w-full accent-[#8B7CFF]"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[10px] text-[var(--studio-text-muted)]">
                          <span>Shake</span>
                          <span className="font-mono tabular-nums">{Math.round(kf.shake)}px</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={28}
                          value={kf.shake}
                          onChange={(e) => upsertCam({ shake: Number(e.target.value) })}
                          className="w-full accent-rose-400"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-[var(--studio-text-muted)]">Easing</span>
                      <select
                        value={kf.easing}
                        onChange={(e) => upsertCam({ easing: e.target.value as EasingType })}
                        className="px-1.5 py-0.5 rounded bg-[var(--studio-bg)] border border-[var(--studio-border)] text-[10px]"
                      >
                        <option value="linear">Linear</option>
                        <option value="ease-in">Ease In</option>
                        <option value="ease-out">Ease Out</option>
                        <option value="ease-in-out">Ease In-Out</option>
                      </select>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Non-Destructive Anime Compositing VFX */}
            <div className="pt-3 border-t border-[var(--studio-border)] space-y-2">
              <h3 className="font-display font-semibold text-xs text-[var(--studio-text)]">
                Anime Compositing & VFX
              </h3>
              <div className="space-y-1.5">
                {scene.effects.map((fx) => (
                  <div
                    key={fx.id}
                    className="p-2 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] space-y-1.5"
                  >
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-[11px] font-medium">{fx.label}</span>
                      <input
                        type="checkbox"
                        checked={fx.enabled}
                        onChange={(e) =>
                          onUpdateEffects(
                            scene.effects.map((item) =>
                              item.id === fx.id ? { ...item, enabled: e.target.checked } : item
                            )
                          )
                        }
                        className="accent-[#8B7CFF]"
                      />
                    </label>
                    {fx.enabled && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[var(--studio-text-muted)] w-14">
                          Strength
                        </span>
                        <input
                          type="range"
                          min={0.05}
                          max={1}
                          step={0.05}
                          value={fx.intensity}
                          onChange={(e) =>
                            onUpdateEffects(
                              scene.effects.map((item) =>
                                item.id === fx.id
                                  ? { ...item, intensity: Number(e.target.value) }
                                  : item
                              )
                            )
                          }
                          className="flex-1 accent-[#64D6C5]"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {activeTab === 'ai' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold text-xs text-[var(--studio-text)]">
                Optional AI Production Assistant
              </h2>
            </div>

            {aiStatus && !aiStatus.available && (
              <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/40 text-amber-300 text-[11px] space-y-1">
                <p className="font-semibold">AI Backend Not Configured</p>
                <p className="opacity-90">
                  {aiStatus.message} All manual drawing, animation, rigging, and compositing tools
                  remain 100% available.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <div className="p-2 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[11px]">A. AI In-Betweening</span>
                  <select
                    value={inbetweenCount}
                    onChange={(e) => setInbetweenCount(Number(e.target.value))}
                    aria-label="Intermediate Frame Count"
                    className="bg-[var(--studio-bg)] border border-[var(--studio-border)] rounded px-1.5 py-0.5 text-[10px]"
                  >
                    <option value={1}>1 Frame</option>
                    <option value={2}>2 Frames</option>
                    <option value={3}>3 Frames</option>
                  </select>
                </div>
                <button
                  type="button"
                  disabled={aiBusy}
                  onClick={() => runAiTask('inbetween')}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-[#8B7CFF] hover:bg-[#7A6AEF] text-white text-[11px] font-medium disabled:opacity-50"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  {aiBusy && aiTaskType === 'inbetween'
                    ? 'Generating Proposal...'
                    : 'Propose In-Betweens'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={aiBusy}
                  onClick={() => runAiTask('smart-color')}
                  className="p-2 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] hover:border-[#64D6C5] text-left text-[11px]"
                >
                  <div className="font-medium">Smart Coloring</div>
                  <div className="text-[10px] text-[var(--studio-text-muted)]">
                    Detect gaps & palette
                  </div>
                </button>
                <button
                  type="button"
                  disabled={aiBusy}
                  onClick={() => runAiTask('line-art')}
                  className="p-2 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] hover:border-[#64D6C5] text-left text-[11px]"
                >
                  <div className="font-medium">Line Art Assist</div>
                  <div className="text-[10px] text-[var(--studio-text-muted)]">
                    Clean-up & broken lines
                  </div>
                </button>
                <button
                  type="button"
                  disabled={aiBusy}
                  onClick={() => runAiTask('consistency')}
                  className="p-2 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] hover:border-[#64D6C5] text-left text-[11px]"
                >
                  <div className="font-medium">Model Consistency</div>
                  <div className="text-[10px] text-[var(--studio-text-muted)]">
                    Compare vs Ref Sheet
                  </div>
                </button>
                <button
                  type="button"
                  disabled={aiBusy}
                  onClick={() => runAiTask('timing')}
                  className="p-2 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] hover:border-[#64D6C5] text-left text-[11px]"
                >
                  <div className="font-medium">Timing Review</div>
                  <div className="text-[10px] text-[var(--studio-text-muted)]">
                    Spacing & X-sheet tips
                  </div>
                </button>
              </div>
            </div>

            {aiError && (
              <div className="p-2 rounded bg-rose-500/15 border border-rose-500/40 text-rose-300 text-[11px]">
                {aiError}
              </div>
            )}

            {aiResult && (
              <div className="p-2.5 rounded bg-[var(--studio-panel)] border border-[#64D6C5]/50 space-y-2 text-[11px]">
                <p className="font-medium text-[#64D6C5]">AI Proposal (Non-Destructive)</p>
                {typeof aiResult.summary === 'string' && <p>{aiResult.summary}</p>}
                {Array.isArray(aiResult.frames) && aiResult.frames.length > 0 && (
                  <div className="flex gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const proposed = (
                          aiResult.frames as {
                            strokes?: {
                              color?: string;
                              size?: number;
                              points?: { x: number; y: number }[];
                            }[];
                          }[]
                        ).map((f, fIdx) =>
                          (f.strokes ?? []).map((s, sIdx) => ({
                            id: `ai-${Date.now()}-${fIdx}-${sIdx}`,
                            tool: 'pen' as const,
                            color: s.color || activeColor,
                            size: s.size || 4,
                            opacity: 1,
                            hardness: 0.9,
                            texture: 'smooth' as const,
                            points: (s.points ?? []).map((p) => ({
                              x: p.x,
                              y: p.y,
                              pressure: 0.75,
                            })),
                          }))
                        );
                        onInsertAiInbetweenFrames(proposed);
                        setAiResult(null);
                      }}
                      className="flex-1 py-1 rounded bg-[#64D6C5] text-[#111827] font-semibold"
                    >
                      Accept & Insert
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiResult(null)}
                      className="px-3 py-1 rounded border border-[var(--studio-border)]"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
