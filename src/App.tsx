import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanelRightOpen } from 'lucide-react';
import {
  decodeAudioFile,
  playTracksFromFrame,
  scrubAudioFrame,
  stopAllAudioPlayback,
} from './audio/audioEngine';
import { DrawingCanvas } from './canvas/DrawingCanvas';
import { BottomTimeline } from './components/BottomTimeline';
import { LeftToolRail } from './components/LeftToolRail';
import { ExportModal, ProjectModal, ShortcutsModal } from './components/Modals';
import { InspectorTab, RightInspector } from './components/RightInspector';
import { TopToolbar } from './components/TopToolbar';
import {
  loadAutosaveProject,
  saveAutosaveProject,
  saveVersionSnapshot,
} from './engine/projectStore';
import {
  DEFAULT_BRUSH_PRESETS,
  DEFAULT_SHORTCUTS,
  createInitialProject,
} from './engine/templates';
import {
  deleteCelById,
  duplicateCelAfter,
  insertOrUpdateCel,
  moveCelToFrame,
  resolveCelAtFrame,
  resolveLayerTransformAtFrame,
} from './engine/timeline';
import type {
  AudioTrack,
  Bone,
  BrushPreset,
  CameraKeyframe,
  CelFrame,
  CompositeEffect,
  EasingType,
  GuideConfig,
  Layer,
  MouthShapeId,
  OnionSkinConfig,
  ReferenceItem,
  Scene,
  ShortcutMap,
  StudioMode,
  StudioProject,
  ThemeMode,
  ToolId,
  TransformKeyframe,
  VectorStroke,
} from './engine/types';

export default function App() {
  const [project, setProject] = useState<StudioProject>(() => createInitialProject());
  const [historyPast, setHistoryPast] = useState<StudioProject[]>([]);
  const [historyFuture, setHistoryFuture] = useState<StudioProject[]>([]);
  const [lastSavedLabel, setLastSavedLabel] = useState('Autosaved');

  const [studioMode, setStudioMode] = useState<StudioMode>('professional');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopPlayback, setLoopPlayback] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const [activeLayerId, setActiveLayerId] = useState<string>('layer-character');
  const [activeTool, setActiveTool] = useState<ToolId>('pencil');
  const [activeColor, setActiveColor] = useState('#8B7CFF');
  const [recentColors, setRecentColors] = useState<string[]>([
    '#8B7CFF',
    '#64D6C5',
    '#F3F4F6',
    '#FF6B6B',
  ]);
  const [brushPreset, setBrushPreset] = useState<BrushPreset>(DEFAULT_BRUSH_PRESETS[0]);
  const [shapeFill, setShapeFill] = useState(false);

  const selectColor = useCallback((hex: string) => {
    setActiveColor(hex);
    setRecentColors((prev) => {
      const next = [hex, ...prev.filter((c) => c.toLowerCase() !== hex.toLowerCase())];
      return next.slice(0, 8);
    });
  }, []);

  const [onionSkin, setOnionSkin] = useState<OnionSkinConfig>({
    enabled: true,
    prevFrames: 1,
    nextFrames: 1,
    opacity: 0.35,
    prevColor: '#8B7CFF',
    nextColor: '#64D6C5',
  });

  const [guides, setGuides] = useState<GuideConfig>({
    grid: false,
    gridSize: 64,
    perspective: false,
    safeArea: false,
    symmetry: 'none',
    radialSegments: 6,
  });

  const [cameraPreviewMode, setCameraPreviewMode] = useState(false);
  const [showRigOverlay, setShowRigOverlay] = useState(false);
  const [rigEditMode, setRigEditMode] = useState(false);
  const [selectedBoneId, setSelectedBoneId] = useState<string | null>('bone-hips');
  const [palmRejection, setPalmRejection] = useState(true);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotationDeg, setRotationDeg] = useState(0);

  const [inspectorOpen, setInspectorOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('layers');
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(DEFAULT_SHORTCUTS);

  const activeScene: Scene = useMemo(() => {
    return (
      project.scenes.find((s) => s.id === project.activeSceneId) ?? project.scenes[0]
    );
  }, [project]);

  const activeLayer: Layer | undefined = useMemo(() => {
    return (
      activeScene.layers.find((l) => l.id === activeLayerId) ?? activeScene.layers[0]
    );
  }, [activeScene.layers, activeLayerId]);

  // Ensure activeLayerId always points to an existing layer when switching scenes
  useEffect(() => {
    if (!activeScene.layers.some((l) => l.id === activeLayerId) && activeScene.layers[0]) {
      setActiveLayerId(activeScene.layers[0].id);
    }
  }, [activeScene.layers, activeLayerId]);

  // Sync dark/light class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  // Load IndexedDB autosave on boot (unless ?fresh=1)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('fresh') === '1') return;
    loadAutosaveProject().then((res) => {
      if (res?.project) {
        const existingIds = new Set(res.project.customBrushes.map((b) => b.id));
        const mergedBrushes = [
          ...DEFAULT_BRUSH_PRESETS.filter((b) => !existingIds.has(b.id)),
          ...res.project.customBrushes,
        ];
        setProject({ ...res.project, customBrushes: mergedBrushes });
        setLastSavedLabel('Recovered');
      }
    });
  }, []);

  // Debounced autosave
  useEffect(() => {
    const timer = setTimeout(() => {
      saveAutosaveProject(project).then(() => {
        setLastSavedLabel('Autosaved');
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [project]);

  const projectRef = useRef(project);
  projectRef.current = project;
  const historyPastRef = useRef(historyPast);
  historyPastRef.current = historyPast;
  const historyFutureRef = useRef(historyFuture);
  historyFutureRef.current = historyFuture;

  const commitProject = useCallback(
    (updater: (prev: StudioProject) => StudioProject) => {
      const current = projectRef.current;
      const next = { ...updater(current), updatedAt: new Date().toISOString() };
      projectRef.current = next;
      setProject(next);
      setHistoryPast((past) => [...past.slice(-55), current]);
      setHistoryFuture([]);
    },
    []
  );

  const updateActiveScene = useCallback(
    (updater: (scene: Scene) => Scene) => {
      commitProject((prev) => ({
        ...prev,
        scenes: prev.scenes.map((s) =>
          s.id === prev.activeSceneId ? updater(s) : s
        ),
      }));
    },
    [commitProject]
  );

  const handleUndo = useCallback(() => {
    const past = historyPastRef.current;
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    const current = projectRef.current;
    projectRef.current = previous;
    setProject(previous);
    setHistoryPast(past.slice(0, -1));
    setHistoryFuture([current, ...historyFutureRef.current]);
  }, []);

  const handleRedo = useCallback(() => {
    const fut = historyFutureRef.current;
    if (fut.length === 0) return;
    const next = fut[0];
    const current = projectRef.current;
    projectRef.current = next;
    setProject(next);
    setHistoryPast([...historyPastRef.current, current]);
    setHistoryFuture(fut.slice(1));
  }, []);

  // Animation Playback Loop
  const playbackRef = useRef({
    frame: currentFrame,
    totalFrames: activeScene.totalFrames,
    fps: activeScene.fps,
    speed: playbackSpeed,
    loop: loopPlayback,
  });
  playbackRef.current = {
    frame: currentFrame,
    totalFrames: activeScene.totalFrames,
    fps: activeScene.fps,
    speed: playbackSpeed,
    loop: loopPlayback,
  };

  useEffect(() => {
    if (!isPlaying) {
      stopAllAudioPlayback();
      return;
    }

    playTracksFromFrame(activeScene.audioTracks, currentFrame, activeScene.fps);

    let rafId = 0;
    let lastTime = performance.now();
    let acc = 0;

    const tick = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      acc += dt;
      const frameMs = 1000 / (playbackRef.current.fps * playbackRef.current.speed);

      if (acc >= frameMs) {
        acc %= frameMs;
        const nextFrame = playbackRef.current.frame + 1;
        if (nextFrame >= playbackRef.current.totalFrames) {
          if (playbackRef.current.loop) {
            setCurrentFrame(0);
            playTracksFromFrame(activeScene.audioTracks, 0, playbackRef.current.fps);
          } else {
            setIsPlaying(false);
            return;
          }
        } else {
          setCurrentFrame(nextFrame);
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      stopAllAudioPlayback();
    };
  }, [isPlaying, activeScene.audioTracks, activeScene.fps]);

  const handleSeekFrame = useCallback(
    (frame: number) => {
      const clamped = Math.max(0, Math.min(activeScene.totalFrames - 1, frame));
      setCurrentFrame(clamped);
      if (!isPlaying && activeScene.audioTracks.length > 0) {
        scrubAudioFrame(activeScene.audioTracks, clamped, activeScene.fps);
      }
    },
    [activeScene.totalFrames, activeScene.audioTracks, activeScene.fps, isPlaying]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveVersionSnapshot(project, 'Quick Save').then(() => setLastSavedLabel('Saved'));
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleSeekFrame(currentFrame - 1);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleSeekFrame(currentFrame + 1);
        return;
      }

      const upper = e.key.toUpperCase();
      if (upper === shortcuts.onionSkin.toUpperCase()) {
        setOnionSkin((o) => ({ ...o, enabled: !o.enabled }));
        return;
      }

      const toolIds: ToolId[] = [
        'pencil',
        'brush',
        'pen',
        'eraser',
        'line',
        'rect',
        'ellipse',
        'lasso',
        'transform',
        'fill',
        'eyedropper',
        'text',
        'hand',
        'zoom',
      ];
      for (const tid of toolIds) {
        if (shortcuts[tid] && shortcuts[tid].toUpperCase() === upper) {
          setActiveTool(tid);
          break;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentFrame, handleRedo, handleSeekFrame, handleUndo, project, shortcuts]);

  // Drawing / Cel mutation handlers
  const handleCommitStrokes = (newStrokes: VectorStroke[]) => {
    if (!activeLayer) return;
    updateActiveScene((sc) => ({
      ...sc,
      layers: sc.layers.map((l) => {
        if (l.id !== activeLayer.id) return l;
        const existingCel = resolveCelAtFrame(l, currentFrame);
        if (existingCel) {
          return {
            ...l,
            cels: l.cels.map((c) =>
              c.id === existingCel.id
                ? { ...c, strokes: [...c.strokes, ...newStrokes] }
                : c
            ),
          };
        }
        const created: CelFrame = {
          id: `cel-${Date.now()}`,
          frameIndex: currentFrame,
          durationFrames: 1,
          isKey: true,
          strokes: newStrokes,
        };
        return {
          ...l,
          cels: insertOrUpdateCel(l.cels, created),
        };
      }),
    }));
  };

  const handleUpdateCelRaster = (rasterDataUrl: string) => {
    if (!activeLayer) return;
    updateActiveScene((sc) => ({
      ...sc,
      layers: sc.layers.map((l) => {
        if (l.id !== activeLayer.id) return l;
        const existing = resolveCelAtFrame(l, currentFrame);
        if (existing) {
          return {
            ...l,
            cels: l.cels.map((c) =>
              c.id === existing.id ? { ...c, rasterDataUrl, strokes: [] } : c
            ),
          };
        }
        return {
          ...l,
          cels: insertOrUpdateCel(l.cels, {
            id: `cel-${Date.now()}`,
            frameIndex: currentFrame,
            durationFrames: 1,
            isKey: true,
            rasterDataUrl,
            strokes: [],
          }),
        };
      }),
    }));
  };

  const preTransformProjectRef = useRef<StudioProject | null>(null);

  const handleTransformStart = useCallback(() => {
    preTransformProjectRef.current = projectRef.current;
  }, []);

  const handleReplaceCelStrokes = (strokes: VectorStroke[]) => {
    if (!activeLayer) return;
    const existing = resolveCelAtFrame(activeLayer, currentFrame);
    if (!existing) return;
    setProject((prev) => {
      const next = {
        ...prev,
        scenes: prev.scenes.map((sc) =>
          sc.id !== prev.activeSceneId
            ? sc
            : {
                ...sc,
                layers: sc.layers.map((l) =>
                  l.id !== activeLayer.id
                    ? l
                    : {
                        ...l,
                        cels: l.cels.map((c) =>
                          c.id === existing.id ? { ...c, strokes } : c
                        ),
                      }
                ),
              }
        ),
      };
      projectRef.current = next;
      return next;
    });
  };

  const handleTransformEnd = useCallback(() => {
    const snap = preTransformProjectRef.current;
    preTransformProjectRef.current = null;
    if (snap && snap !== projectRef.current) {
      setHistoryPast((past) => [...past.slice(-55), snap]);
      setHistoryFuture([]);
      setProject((prev) => {
        const next = { ...prev, updatedAt: new Date().toISOString() };
        projectRef.current = next;
        return next;
      });
    }
  }, []);

  const handleCommitTransformStrokes = (strokes: VectorStroke[]) => {
    if (!activeLayer) return;
    const existing = resolveCelAtFrame(activeLayer, currentFrame);
    if (!existing) return;
    updateActiveScene((sc) => ({
      ...sc,
      layers: sc.layers.map((l) =>
        l.id !== activeLayer.id
          ? l
          : {
              ...l,
              cels: l.cels.map((c) => (c.id === existing.id ? { ...c, strokes } : c)),
            }
      ),
    }));
  };

  const handleClearActiveCel = () => {
    if (!activeLayer) return;
    const existing = resolveCelAtFrame(activeLayer, currentFrame);
    if (!existing) return;
    updateActiveScene((sc) => ({
      ...sc,
      layers: sc.layers.map((l) =>
        l.id !== activeLayer.id
          ? l
          : {
              ...l,
              cels: l.cels.map((c) =>
                c.id === existing.id ? { ...c, strokes: [], rasterDataUrl: undefined } : c
              ),
            }
      ),
    }));
  };

  // Timeline Cel Operations
  const handleInsertKeyframe = () => {
    if (!activeLayer) return;
    updateActiveScene((sc) => ({
      ...sc,
      layers: sc.layers.map((l) => {
        if (l.id !== activeLayer.id) return l;
        const cel: CelFrame = {
          id: `cel-${Date.now()}`,
          frameIndex: currentFrame,
          durationFrames: 1,
          isKey: true,
          strokes: [],
          label: `Key ${l.cels.length + 1}`,
        };
        return { ...l, cels: insertOrUpdateCel(l.cels, cel) };
      }),
    }));
  };

  const handleDuplicateCel = () => {
    if (!activeLayer) return;
    const cel = resolveCelAtFrame(activeLayer, currentFrame);
    if (!cel) return;
    updateActiveScene((sc) => ({
      ...sc,
      layers: sc.layers.map((l) =>
        l.id !== activeLayer.id
          ? l
          : { ...l, cels: duplicateCelAfter(l.cels, cel.id, `cel-${Date.now()}`) }
      ),
    }));
  };

  const handleDeleteCel = () => {
    if (!activeLayer) return;
    const cel = resolveCelAtFrame(activeLayer, currentFrame);
    if (!cel) return;
    updateActiveScene((sc) => ({
      ...sc,
      layers: sc.layers.map((l) =>
        l.id !== activeLayer.id
          ? l
          : { ...l, cels: deleteCelById(l.cels, cel.id) }
      ),
    }));
  };

  const handleAdjustExposure = (delta: -1 | 1) => {
    if (!activeLayer) return;
    const cel = resolveCelAtFrame(activeLayer, currentFrame);
    if (!cel) return;
    updateActiveScene((sc) => ({
      ...sc,
      layers: sc.layers.map((l) =>
        l.id !== activeLayer.id
          ? l
          : {
              ...l,
              cels: l.cels.map((c) =>
                c.id === cel.id
                  ? { ...c, durationFrames: Math.max(1, c.durationFrames + delta) }
                  : c
              ),
            }
      ),
    }));
  };

  const handleSelectTool = (tool: ToolId) => {
    setActiveTool(tool);
    const matching = project.customBrushes.find((b) => b.tool === tool);
    if (matching) setBrushPreset(matching);
  };

  return (
    <div
      data-mode={studioMode}
      data-theme={theme}
      className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--studio-bg)] text-[var(--studio-text)]"
    >
      {/* Top Studio Toolbar */}
      <TopToolbar
        projectName={project.name}
        sceneName={activeScene.name}
        isPlaying={isPlaying}
        loopPlayback={loopPlayback}
        currentFrame={currentFrame}
        totalFrames={activeScene.totalFrames}
        fps={activeScene.fps}
        playbackSpeed={playbackSpeed}
        zoom={zoom}
        canUndo={historyPast.length > 0}
        canRedo={historyFuture.length > 0}
        studioMode={studioMode}
        theme={theme}
        lastSavedLabel={lastSavedLabel}
        onOpenProjects={() => setProjectModalOpen(true)}
        onSaveProject={() =>
          saveVersionSnapshot(project, 'Manual Snapshot').then(() =>
            setLastSavedLabel('Saved')
          )
        }
        onUndo={handleUndo}
        onRedo={handleRedo}
        onTogglePlay={() => setIsPlaying((p) => !p)}
        onToggleLoop={() => setLoopPlayback((l) => !l)}
        onSeekFrame={handleSeekFrame}
        onChangeFps={(fps) => updateActiveScene((sc) => ({ ...sc, fps }))}
        onChangeSpeed={setPlaybackSpeed}
        onChangeZoom={setZoom}
        onChangeMode={(mode) => {
          setStudioMode(mode);
          if (mode === 'beginner' && (inspectorTab === 'rig' || inspectorTab === 'camera' || inspectorTab === 'ai')) {
            setInspectorTab('layers');
          }
        }}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        onOpenShortcuts={() => setShortcutsModalOpen(true)}
        onOpenExport={() => setExportModalOpen(true)}
        onToggleInspectorMobile={() => setInspectorOpen((o) => !o)}
      />

      {/* Middle Workspace: Left Tool Rail + Center Canvas + Right Inspector */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        <LeftToolRail
          activeTool={activeTool}
          activeColor={activeColor}
          brushPreset={brushPreset}
          studioMode={studioMode}
          onSelectTool={handleSelectTool}
          onUpdateBrush={(patch) => setBrushPreset((b) => ({ ...b, ...patch }))}
          onOpenColorTab={() => {
            setInspectorOpen(true);
            setInspectorTab('brush');
          }}
        />

        <DrawingCanvas
          scene={activeScene}
          currentFrame={currentFrame}
          activeLayer={activeLayer}
          activeTool={activeTool}
          activeColor={activeColor}
          brushPreset={brushPreset}
          shapeFill={shapeFill}
          onionSkin={onionSkin}
          guides={guides}
          cameraPreviewMode={cameraPreviewMode}
          showRigOverlay={showRigOverlay}
          rigEditMode={rigEditMode}
          selectedBoneId={selectedBoneId}
          palmRejection={palmRejection}
          zoom={zoom}
          pan={pan}
          rotationDeg={rotationDeg}
          onZoomChange={setZoom}
          onPanChange={setPan}
          onRotationChange={setRotationDeg}
          onToggleShapeFill={() => setShapeFill((v) => !v)}
          onCommitStrokes={handleCommitStrokes}
          onUpdateCelRaster={handleUpdateCelRaster}
          onReplaceCelStrokes={handleReplaceCelStrokes}
          onCommitTransformStrokes={handleCommitTransformStrokes}
          onTransformStart={handleTransformStart}
          onTransformEnd={handleTransformEnd}
          onClearActiveCel={handleClearActiveCel}
          onPickColor={selectColor}
          onSelectBone={setSelectedBoneId}
          onUpdateBoneAngle={(boneId, angle, rootPos) => {
            updateActiveScene((sc) => ({
              ...sc,
              rig: {
                ...sc.rig,
                bones: sc.rig.bones.map((b) =>
                  b.id === boneId
                    ? {
                        ...b,
                        angle,
                        x: rootPos ? rootPos.x : b.x,
                        y: rootPos ? rootPos.y : b.y,
                      }
                    : b
                ),
              },
            }));
          }}
          onToggleCameraPreview={() => setCameraPreviewMode((v) => !v)}
        />

        {!inspectorOpen && (
          <button
            type="button"
            onClick={() => setInspectorOpen(true)}
            aria-label="Expand Inspector Sidebar"
            className="absolute top-3 right-3 z-20 p-2 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] text-[var(--studio-text)] shadow-lg hover:border-[#8B7CFF]"
          >
            <PanelRightOpen className="w-4 h-4" />
          </button>
        )}

        <RightInspector
          isOpen={inspectorOpen}
          activeTab={inspectorTab}
          studioMode={studioMode}
          scene={activeScene}
          currentFrame={currentFrame}
          activeLayerId={activeLayer?.id ?? ''}
          activeColor={activeColor}
          palette={project.palette}
          recentColors={recentColors}
          brushPreset={brushPreset}
          brushPresets={project.customBrushes}
          shapeFill={shapeFill}
          guides={guides}
          rotationDeg={rotationDeg}
          palmRejection={palmRejection}
          showRigOverlay={showRigOverlay}
          rigEditMode={rigEditMode}
          selectedBoneId={selectedBoneId}
          onClose={() => setInspectorOpen(false)}
          onChangeTab={setInspectorTab}
          onSelectLayer={setActiveLayerId}
          onAddLayer={(type) => {
            const newLayer: Layer = {
              id: `layer-${Date.now()}`,
              name:
                type === 'vfx'
                  ? `VFX ${activeScene.layers.length + 1}`
                  : `Cel Layer ${activeScene.layers.length + 1}`,
              type,
              visible: true,
              locked: false,
              clippingMask: false,
              blendMode: type === 'vfx' ? 'lighter' : 'normal',
              opacity: 1,
              parallaxDepth: 1,
              cels: [
                {
                  id: `cel-${Date.now()}`,
                  frameIndex: 0,
                  durationFrames: 4,
                  isKey: true,
                  strokes: [],
                },
              ],
              keyframes: [],
            };
            updateActiveScene((sc) => ({
              ...sc,
              layers: [...sc.layers, newLayer],
            }));
            setActiveLayerId(newLayer.id);
          }}
          onDuplicateLayer={(id) => {
            const src = activeScene.layers.find((l) => l.id === id);
            if (!src) return;
            const copy: Layer = {
              ...src,
              id: `layer-${Date.now()}`,
              name: `${src.name} Copy`,
              cels: src.cels.map((c, idx) => ({
                ...c,
                id: `cel-${Date.now()}-${idx}`,
                strokes: c.strokes.map((s) => ({ ...s, id: `${s.id}-d` })),
              })),
            };
            updateActiveScene((sc) => ({ ...sc, layers: [...sc.layers, copy] }));
            setActiveLayerId(copy.id);
          }}
          onDeleteLayer={(id) => {
            if (activeScene.layers.length <= 1) return;
            updateActiveScene((sc) => ({
              ...sc,
              layers: sc.layers.filter((l) => l.id !== id),
            }));
          }}
          onMoveLayer={(id, dir) => {
            updateActiveScene((sc) => {
              const idx = sc.layers.findIndex((l) => l.id === id);
              const target = idx + dir;
              if (idx < 0 || target < 0 || target >= sc.layers.length) return sc;
              const arr = [...sc.layers];
              const [item] = arr.splice(idx, 1);
              arr.splice(target, 0, item);
              return { ...sc, layers: arr };
            });
          }}
          onUpdateLayer={(id, patch) => {
            updateActiveScene((sc) => ({
              ...sc,
              layers: sc.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
            }));
          }}
          onUpsertLayerKeyframe={(layerId: string, kf: TransformKeyframe) => {
            updateActiveScene((sc) => ({
              ...sc,
              layers: sc.layers.map((l) =>
                l.id !== layerId
                  ? l
                  : {
                      ...l,
                      keyframes: [
                        ...l.keyframes.filter((k) => k.frame !== kf.frame),
                        kf,
                      ].sort((a, b) => a.frame - b.frame),
                    }
              ),
            }));
          }}
          onDeleteLayerKeyframe={(layerId: string, frame: number) => {
            updateActiveScene((sc) => ({
              ...sc,
              layers: sc.layers.map((l) =>
                l.id !== layerId
                  ? l
                  : {
                      ...l,
                      keyframes: l.keyframes.filter((k) => k.frame !== frame),
                    }
              ),
            }));
          }}
          onChangeColor={selectColor}
          onAddPaletteSwatch={(hex) => {
            if (!project.palette.includes(hex)) {
              commitProject((p) => ({ ...p, palette: [...p.palette, hex] }));
            }
          }}
          onSelectBrushPreset={(preset) => {
            setBrushPreset(preset);
            setActiveTool(preset.tool);
          }}
          onUpdateBrush={(patch) => setBrushPreset((b) => ({ ...b, ...patch }))}
          onToggleShapeFill={() => setShapeFill((v) => !v)}
          onSaveCustomBrush={(name) => {
            const custom: BrushPreset = {
              ...brushPreset,
              id: `brush-${Date.now()}`,
              name,
            };
            commitProject((p) => ({
              ...p,
              customBrushes: [...p.customBrushes, custom],
            }));
            setBrushPreset(custom);
          }}
          onUpdateGuides={(patch) => setGuides((g) => ({ ...g, ...patch }))}
          onUpdateScene={(patch) => updateActiveScene((sc) => ({ ...sc, ...patch }))}
          onChangeRotation={setRotationDeg}
          onTogglePalmRejection={() => setPalmRejection((p) => !p)}
          onAddReferenceImage={(item: ReferenceItem) =>
            updateActiveScene((sc) => ({
              ...sc,
              references: [...sc.references, item],
            }))
          }
          onUpdateReference={(id, patch) =>
            updateActiveScene((sc) => ({
              ...sc,
              references: sc.references.map((r) => (r.id === id ? { ...r, ...patch } : r)),
            }))
          }
          onDeleteReference={(id) =>
            updateActiveScene((sc) => ({
              ...sc,
              references: sc.references.filter((r) => r.id !== id),
            }))
          }
          onToggleRigOverlay={() => setShowRigOverlay((v) => !v)}
          onToggleRigEditMode={() => {
            setShowRigOverlay(true);
            setRigEditMode((v) => !v);
          }}
          onSelectBone={setSelectedBoneId}
          onUpdateBones={(bones: Bone[]) =>
            updateActiveScene((sc) => ({
              ...sc,
              rig: { ...sc.rig, bones },
            }))
          }
          onApplyPose={(poseId) => {
            const pose = activeScene.rig.poses.find((p) => p.id === poseId);
            if (!pose) return;
            setShowRigOverlay(true);
            updateActiveScene((sc) => ({
              ...sc,
              rig: {
                ...sc.rig,
                bones: sc.rig.bones.map((b) => {
                  const tf = pose.boneTransforms[b.id];
                  return tf ? { ...b, x: tf.x, y: tf.y, angle: tf.angle } : b;
                }),
              },
            }));
          }}
          onSaveCurrentPose={(name) => {
            const boneTransforms: Record<string, { x: number; y: number; angle: number }> = {};
            for (const b of activeScene.rig.bones) {
              boneTransforms[b.id] = { x: b.x, y: b.y, angle: b.angle };
            }
            updateActiveScene((sc) => ({
              ...sc,
              rig: {
                ...sc.rig,
                poses: [
                  ...sc.rig.poses,
                  { id: `pose-${Date.now()}`, name, boneTransforms },
                ],
              },
            }));
          }}
          onTagLipSync={(mouth: MouthShapeId) => {
            updateActiveScene((sc) => {
              if (sc.audioTracks.length === 0) {
                const track: AudioTrack = {
                  id: `aud-${Date.now()}`,
                  name: 'LipSync_Sheet',
                  startFrame: 0,
                  volume: 0.8,
                  muted: false,
                  durationSec: sc.totalFrames / sc.fps,
                  peaks: Array.from({ length: 24 }, () => 0.25),
                  lipSyncMarkers: [
                    { id: `ls-${Date.now()}`, frame: currentFrame, mouthShape: mouth },
                  ],
                };
                return { ...sc, audioTracks: [track] };
              }
              return {
                ...sc,
                audioTracks: sc.audioTracks.map((t, idx) =>
                  idx === 0
                    ? {
                        ...t,
                        lipSyncMarkers: [
                          ...t.lipSyncMarkers.filter((m) => m.frame !== currentFrame),
                          { id: `ls-${Date.now()}`, frame: currentFrame, mouthShape: mouth },
                        ],
                      }
                    : t
                ),
              };
            });
          }}
          onUpsertCameraKeyframe={(kf: CameraKeyframe) =>
            updateActiveScene((sc) => ({
              ...sc,
              cameraKeyframes: [
                ...sc.cameraKeyframes.filter((k) => k.frame !== kf.frame),
                kf,
              ].sort((a, b) => a.frame - b.frame),
            }))
          }
          onDeleteCameraKeyframe={(frame: number) =>
            updateActiveScene((sc) => ({
              ...sc,
              cameraKeyframes: sc.cameraKeyframes.filter((k) => k.frame !== frame),
            }))
          }
          onUpdateEffects={(effects: CompositeEffect[]) =>
            updateActiveScene((sc) => ({ ...sc, effects }))
          }
          onInsertAiInbetweenFrames={(frameStrokeLists) => {
            if (!activeLayer) return;
            updateActiveScene((sc) => ({
              ...sc,
              layers: sc.layers.map((l) => {
                if (l.id !== activeLayer.id) return l;
                let nextCels = [...l.cels];
                frameStrokeLists.forEach((strokes, i) => {
                  nextCels = insertOrUpdateCel(nextCels, {
                    id: `ai-cel-${Date.now()}-${i}`,
                    frameIndex: currentFrame + i + 1,
                    durationFrames: 1,
                    isKey: false,
                    label: 'AI In-Between',
                    strokes,
                  });
                });
                return { ...l, cels: nextCels };
              }),
            }));
          }}
        />
      </div>

      {/* Bottom Timeline & X-Sheet */}
      <BottomTimeline
        scene={activeScene}
        currentFrame={currentFrame}
        activeLayerId={activeLayer?.id ?? ''}
        onionSkin={onionSkin}
        studioMode={studioMode}
        onSeekFrame={handleSeekFrame}
        onSelectLayer={setActiveLayerId}
        onUpdateOnionSkin={(patch) => setOnionSkin((o) => ({ ...o, ...patch }))}
        onInsertKeyframe={handleInsertKeyframe}
        onDuplicateCel={handleDuplicateCel}
        onDeleteCel={handleDeleteCel}
        onAdjustExposure={handleAdjustExposure}
        onMoveCel={(layerId, celId, targetFrame) => {
          updateActiveScene((sc) => ({
            ...sc,
            layers: sc.layers.map((l) =>
              l.id === layerId ? { ...l, cels: moveCelToFrame(l.cels, celId, targetFrame) } : l
            ),
          }));
          setCurrentFrame(targetFrame);
        }}
        onAddTimelineMarker={(frame, label) => {
          updateActiveScene((sc) => ({
            ...sc,
            markers: [
              ...sc.markers.filter((m) => m.frame !== frame),
              { id: `mk-${Date.now()}`, frame, label, color: '#8B7CFF' },
            ],
          }));
        }}
        onAddTransformKeyframe={(easing: EasingType) => {
          if (!activeLayer) return;
          const cur = resolveLayerTransformAtFrame(activeLayer.keyframes, currentFrame);
          updateActiveScene((sc) => ({
            ...sc,
            layers: sc.layers.map((l) =>
              l.id !== activeLayer.id
                ? l
                : {
                    ...l,
                    keyframes: [
                      ...l.keyframes.filter((k) => k.frame !== currentFrame),
                      {
                        id: `tf-${Date.now()}`,
                        frame: currentFrame,
                        x: cur.x,
                        y: cur.y,
                        scaleX: cur.scaleX,
                        scaleY: cur.scaleY,
                        rotation: cur.rotation,
                        opacity: cur.opacity,
                        easing,
                      },
                    ].sort((a, b) => a.frame - b.frame),
                  }
            ),
          }));
        }}
        onUpdateTotalFrames={(totalFrames) =>
          updateActiveScene((sc) => ({ ...sc, totalFrames }))
        }
        onAddAudioTrack={async (file) => {
          const decoded = await decodeAudioFile(file);
          updateActiveScene((sc) => ({
            ...sc,
            audioTracks: [
              ...sc.audioTracks,
              {
                id: `aud-${Date.now()}`,
                name: file.name,
                startFrame: currentFrame,
                volume: 0.9,
                muted: false,
                durationSec: decoded.durationSec,
                peaks: decoded.peaks,
                dataUrl: decoded.dataUrl,
                lipSyncMarkers: [],
              },
            ],
          }));
        }}
        onUpdateAudioTrack={(id, patch) =>
          updateActiveScene((sc) => ({
            ...sc,
            audioTracks: sc.audioTracks.map((t) =>
              t.id === id ? { ...t, ...patch } : t
            ),
          }))
        }
      />

      {/* Modals */}
      <ProjectModal
        open={projectModalOpen}
        project={project}
        onClose={() => setProjectModalOpen(false)}
        onUpdateProject={(next) => {
          setProject(next);
          setHistoryPast([]);
          setHistoryFuture([]);
          setCurrentFrame(0);
        }}
        onImportLayers={(layers) => {
          updateActiveScene((sc) => ({
            ...sc,
            layers: [...sc.layers, ...layers],
          }));
          if (layers[0]) setActiveLayerId(layers[0].id);
        }}
        onSaveNamedVersion={async (label) => {
          await saveVersionSnapshot(project, label);
          setLastSavedLabel('Saved');
        }}
      />

      <ExportModal
        open={exportModalOpen}
        scene={activeScene}
        onClose={() => setExportModalOpen(false)}
      />

      <ShortcutsModal
        open={shortcutsModalOpen}
        shortcuts={shortcuts}
        onClose={() => setShortcutsModalOpen(false)}
        onUpdateShortcut={(action, key) =>
          setShortcuts((s) => ({ ...s, [action]: key }))
        }
      />
    </div>
  );
}
