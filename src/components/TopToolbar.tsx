import React from 'react';
import {
  Download,
  FolderOpen,
  HelpCircle,
  Layers,
  Moon,
  Pause,
  Play,
  Redo2,
  Repeat,
  Save,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  Sun,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { StudioMode, ThemeMode } from '../engine/types';

interface TopToolbarProps {
  projectName: string;
  sceneName: string;
  isPlaying: boolean;
  loopPlayback: boolean;
  currentFrame: number;
  totalFrames: number;
  fps: 12 | 24 | 25 | 30;
  playbackSpeed: number;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  studioMode: StudioMode;
  theme: ThemeMode;
  lastSavedLabel: string;
  onOpenProjects: () => void;
  onSaveProject: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onTogglePlay: () => void;
  onToggleLoop: () => void;
  onSeekFrame: (frame: number) => void;
  onChangeFps: (fps: 12 | 24 | 25 | 30) => void;
  onChangeSpeed: (speed: number) => void;
  onChangeZoom: (zoom: number) => void;
  onChangeMode: (mode: StudioMode) => void;
  onToggleTheme: () => void;
  onOpenShortcuts: () => void;
  onOpenExport: () => void;
  onToggleInspectorMobile: () => void;
}

export const TopToolbar: React.FC<TopToolbarProps> = ({
  projectName,
  sceneName,
  isPlaying,
  loopPlayback,
  currentFrame,
  totalFrames,
  fps,
  playbackSpeed,
  zoom,
  canUndo,
  canRedo,
  studioMode,
  theme,
  lastSavedLabel,
  onOpenProjects,
  onSaveProject,
  onUndo,
  onRedo,
  onTogglePlay,
  onToggleLoop,
  onSeekFrame,
  onChangeFps,
  onChangeSpeed,
  onChangeZoom,
  onChangeMode,
  onToggleTheme,
  onOpenShortcuts,
  onOpenExport,
  onToggleInspectorMobile,
}) => {
  return (
    <header className="h-12 shrink-0 flex items-center justify-between gap-1.5 sm:gap-3 px-2 sm:px-3 bg-[var(--studio-surface)] border-b border-[var(--studio-border)] select-none overflow-x-auto">
      {/* Left: Brand & File Actions */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <span className="font-display font-bold text-xs sm:text-sm tracking-tight text-[var(--studio-text)] whitespace-nowrap pr-1.5 sm:pr-2 border-r border-[var(--studio-border)]">
          Koma Studio
        </span>

        <button
          type="button"
          onClick={onOpenProjects}
          aria-label="Open Projects and Scenes"
          className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium bg-[var(--studio-panel)] hover:bg-[var(--studio-border)]/40 border border-[var(--studio-border)] text-[var(--studio-text)] whitespace-nowrap transition-colors"
        >
          <FolderOpen className="w-3.5 h-3.5 text-[#8B7CFF]" />
          <span className="hidden sm:inline max-w-[130px] truncate">{projectName}</span>
        </button>

        {studioMode === 'studio' && (
          <span className="hidden xl:inline text-xs text-[var(--studio-text-muted)] whitespace-nowrap max-w-[140px] truncate">
            {sceneName}
          </span>
        )}

        <div className="flex items-center gap-0.5 pl-0.5">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            className="p-1.5 rounded text-[var(--studio-text)] hover:bg-[var(--studio-panel)] disabled:opacity-35 disabled:pointer-events-none transition-colors"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
            className="p-1.5 rounded text-[var(--studio-text)] hover:bg-[var(--studio-panel)] disabled:opacity-35 disabled:pointer-events-none transition-colors"
          >
            <Redo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onSaveProject}
            aria-label="Save Project Snapshot"
            title={`Save Snapshot (${lastSavedLabel})`}
            className="hidden sm:flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium text-[var(--studio-text)] hover:bg-[var(--studio-panel)] whitespace-nowrap transition-colors"
          >
            <Save className="w-3.5 h-3.5 text-[#64D6C5]" />
            <span className="hidden md:inline text-[11px] text-[var(--studio-text-muted)]">
              {lastSavedLabel}
            </span>
          </button>
        </div>
      </div>

      {/* Center: Playback, Frame Counter, FPS & Zoom */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="flex items-center bg-[var(--studio-panel)] border border-[var(--studio-border)] rounded px-1 py-0.5 gap-0.5">
          <button
            type="button"
            onClick={() => onSeekFrame(0)}
            aria-label="First Frame"
            className="hidden sm:inline-flex p-1 rounded hover:bg-[var(--studio-border)]/40 text-[var(--studio-text-muted)] hover:text-[var(--studio-text)]"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onSeekFrame(Math.max(0, currentFrame - 1))}
            aria-label="Previous Frame"
            className="hidden sm:inline-flex p-1 rounded hover:bg-[var(--studio-border)]/40 text-[var(--studio-text-muted)] hover:text-[var(--studio-text)]"
          >
            <StepBack className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause Animation' : 'Play Animation'}
            className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors ${
              isPlaying
                ? 'bg-[#64D6C5] text-[#111827]'
                : 'bg-[#8B7CFF] text-white hover:bg-[#7A6AEF]'
            }`}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onSeekFrame((currentFrame + 1) % totalFrames)}
            aria-label="Next Frame"
            className="hidden sm:inline-flex p-1 rounded hover:bg-[var(--studio-border)]/40 text-[var(--studio-text-muted)] hover:text-[var(--studio-text)]"
          >
            <StepForward className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onSeekFrame(totalFrames - 1)}
            aria-label="Last Frame"
            className="hidden sm:inline-flex p-1 rounded hover:bg-[var(--studio-border)]/40 text-[var(--studio-text-muted)] hover:text-[var(--studio-text)]"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggleLoop}
            aria-label="Toggle Loop Playback"
            title="Loop Playback"
            className={`hidden sm:inline-flex p-1 rounded transition-colors ${
              loopPlayback
                ? 'text-[#64D6C5] bg-[#64D6C5]/15'
                : 'text-[var(--studio-text-muted)] hover:text-[var(--studio-text)]'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>
        </div>

        <span
          data-testid="frame-counter"
          className="hidden xs:inline-block sm:inline-block font-mono tabular-nums text-xs px-2 py-1 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] text-[var(--studio-text)] whitespace-nowrap"
        >
          {String(currentFrame + 1).padStart(3, '0')} / {String(totalFrames).padStart(3, '0')}
        </span>

        <label className="sr-only" htmlFor="fps-select">
          Frame Rate
        </label>
        <select
          id="fps-select"
          value={fps}
          onChange={(e) => onChangeFps(Number(e.target.value) as 12 | 24 | 25 | 30)}
          aria-label="Frame Rate FPS"
          className="hidden sm:block bg-[var(--studio-panel)] border border-[var(--studio-border)] rounded px-2 py-1 text-xs font-mono tabular-nums text-[var(--studio-text)] outline-none"
        >
          <option value={12}>12 FPS</option>
          <option value={24}>24 FPS</option>
          <option value={25}>25 FPS</option>
          <option value={30}>30 FPS</option>
        </select>

        {studioMode !== 'beginner' && (
          <select
            value={playbackSpeed}
            onChange={(e) => onChangeSpeed(Number(e.target.value))}
            aria-label="Playback Speed"
            className="hidden lg:block bg-[var(--studio-panel)] border border-[var(--studio-border)] rounded px-1.5 py-1 text-xs font-mono tabular-nums text-[var(--studio-text)] outline-none"
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1.0x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2.0x</option>
          </select>
        )}

        <div className="hidden md:flex items-center gap-0.5 bg-[var(--studio-panel)] border border-[var(--studio-border)] rounded px-1 py-0.5">
          <button
            type="button"
            onClick={() => onChangeZoom(Math.max(0.25, Number((zoom - 0.15).toFixed(2))))}
            aria-label="Zoom Out"
            className="p-1 text-[var(--studio-text-muted)] hover:text-[var(--studio-text)]"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono tabular-nums text-[11px] w-10 text-center text-[var(--studio-text)]">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => onChangeZoom(Math.min(4, Number((zoom + 0.15).toFixed(2))))}
            aria-label="Zoom In"
            className="p-1 text-[var(--studio-text-muted)] hover:text-[var(--studio-text)]"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Right: Workspace Mode, Theme, Help, Export */}
      <div className="flex items-center gap-2 shrink-0">
        <div
          role="group"
          aria-label="Workspace Complexity Mode"
          className="hidden sm:flex items-center bg-[var(--studio-panel)] border border-[var(--studio-border)] rounded p-0.5"
        >
          {(['beginner', 'professional', 'studio'] as StudioMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChangeMode(mode)}
              className={`px-2 py-1 text-[11px] font-medium rounded capitalize whitespace-nowrap transition-colors ${
                studioMode === mode
                  ? 'bg-[#8B7CFF] text-white'
                  : 'text-[var(--studio-text-muted)] hover:text-[var(--studio-text)]'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onToggleInspectorMobile}
          aria-label="Toggle Right Inspector"
          className="lg:hidden p-1.5 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] text-[var(--studio-text)]"
        >
          <Layers className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Theme`}
          title="Toggle Dark / Light Theme"
          className="p-1.5 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] text-[var(--studio-text-muted)] hover:text-[var(--studio-text)] transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={onOpenShortcuts}
          aria-label="Keyboard Shortcuts and Guide"
          title="Keyboard Shortcuts & Guide"
          className="hidden sm:inline-flex p-1.5 rounded bg-[var(--studio-panel)] border border-[var(--studio-border)] text-[var(--studio-text-muted)] hover:text-[var(--studio-text)] transition-colors"
        >
          <HelpCircle className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onOpenExport}
          aria-label="Export Animation"
          className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded text-xs font-semibold bg-[#8B7CFF] hover:bg-[#7A6AEF] text-white whitespace-nowrap transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Export</span>
        </button>
      </div>
    </header>
  );
};
