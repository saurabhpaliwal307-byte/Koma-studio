export type StudioMode = 'beginner' | 'professional' | 'studio';
export type ThemeMode = 'dark' | 'light';

export type ToolId =
  | 'pencil'
  | 'brush'
  | 'pen'
  | 'eraser'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'lasso'
  | 'transform'
  | 'fill'
  | 'eyedropper'
  | 'text'
  | 'hand'
  | 'zoom';

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'lighter'
  | 'darken'
  | 'lighten';

export type SymmetryMode = 'none' | 'vertical' | 'horizontal' | 'quad' | 'radial';
export type BrushTexture =
  | 'smooth'
  | 'charcoal'
  | 'pencil-hb'
  | 'crayon'
  | 'chalk'
  | 'calligraphy'
  | 'ink-grain'
  | 'fountain'
  | 'dashed'
  | 'dotted'
  | 'watercolor'
  | 'gouache'
  | 'oil-impasto'
  | 'marker'
  | 'highlighter'
  | 'airbrush'
  | 'palette-knife'
  | 'pixel'
  | 'halftone'
  | 'crosshatch'
  | 'fur'
  | 'spray'
  | 'glow'
  | 'sparkle'
  | 'ribbon'
  | 'smudge-soft'
  | 'cloud-cumulus'
  | 'cloud-cirrus'
  | 'cloud-anime-cel'
  | 'cloud-nimbus'
  | 'cloud-mist';
export type EasingType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'bezier';
export type MouthShapeId = 'REST' | 'A' | 'E' | 'I' | 'O' | 'U' | 'M_B_P' | 'F_V' | 'L' | 'TH';

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
  t?: number;
}

export interface VectorStroke {
  id: string;
  points: StrokePoint[];
  color: string;
  size: number;
  opacity: number;
  hardness: number;
  texture: BrushTexture;
  tool: 'pencil' | 'brush' | 'pen' | 'eraser' | 'line' | 'rect' | 'ellipse' | 'text';
  text?: string;
  fill?: boolean;
}

export interface BrushPreset {
  id: string;
  name: string;
  tool: 'pencil' | 'brush' | 'pen' | 'eraser';
  size: number;
  opacity: number;
  hardness: number;
  stabilization: number; // 0 to 10
  pressureSize: boolean;
  pressureOpacity: boolean;
  texture: BrushTexture;
}

export interface CelFrame {
  id: string;
  frameIndex: number; // 0-based start frame on timeline
  durationFrames: number; // >= 1 exposure count
  isKey: boolean;
  isHold?: boolean;
  rasterDataUrl?: string; // base64 PNG for raster / fill / imported art
  strokes: VectorStroke[];
  thumbnailUrl?: string;
  label?: string;
}

export interface TransformKeyframe {
  id: string;
  frame: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number; // degrees
  opacity: number; // 0..1
  easing: EasingType;
  bezier?: [number, number, number, number];
}

export interface Layer {
  id: string;
  name: string;
  type: 'cel' | 'rig' | 'background' | 'vfx';
  visible: boolean;
  locked: boolean;
  clippingMask: boolean;
  blendMode: BlendMode;
  opacity: number; // 0..1
  parallaxDepth: number; // 0.2 (far bg) .. 1.0 (normal) .. 1.5 (fg)
  parentGroupId?: string;
  cels: CelFrame[];
  keyframes: TransformKeyframe[];
}

export interface Bone {
  id: string;
  name: string;
  parentId: string | null;
  x: number; // root offset if parentId is null, else relative
  y: number;
  length: number;
  angle: number; // local degrees
  minAngle?: number;
  maxAngle?: number;
  ikEnabled?: boolean;
  ikTargetX?: number;
  ikTargetY?: number;
  boundLayerId?: string;
  color: string;
}

export interface RigPose {
  id: string;
  name: string;
  boneTransforms: Record<string, { x: number; y: number; angle: number }>;
}

export interface ExpressionPreset {
  id: string;
  name: string;
  mouthShape: MouthShapeId;
  eyeState: 'open' | 'blink' | 'half' | 'wide' | 'angry';
  browTilt: number;
}

export interface RigState {
  bones: Bone[];
  poses: RigPose[];
  expressions: ExpressionPreset[];
  activeExpressionId?: string;
}

export interface CameraKeyframe {
  id: string;
  frame: number;
  x: number;
  y: number;
  zoom: number;
  rotation: number; // degrees
  shake: number; // 0..40 px
  easing: EasingType;
}

export type CompositeEffectType =
  | 'anime-glow'
  | 'light-bloom'
  | 'speed-lines'
  | 'impact-flash'
  | 'gaussian-blur'
  | 'motion-blur'
  | 'drop-shadow'
  | 'vignette'
  | 'color-grade'
  | 'particles';

export interface CompositeEffect {
  id: string;
  type: CompositeEffectType;
  label: string;
  enabled: boolean;
  intensity: number; // 0..1
  radius: number; // 0..60
  color?: string;
  brightness?: number; // -100..100
  contrast?: number; // -100..100
  saturation?: number; // -100..100
}

export interface LipSyncMarker {
  id: string;
  frame: number;
  mouthShape: MouthShapeId;
  label?: string;
}

export interface AudioTrack {
  id: string;
  name: string;
  startFrame: number;
  volume: number; // 0..1
  muted: boolean;
  durationSec: number;
  peaks: number[]; // normalized 0..1 waveform bars
  dataUrl?: string;
  lipSyncMarkers: LipSyncMarker[];
}

export interface ReferenceItem {
  id: string;
  name: string;
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  visible: boolean;
  category: 'model-sheet' | 'background' | 'turnaround' | 'expression';
}

export interface TimelineMarker {
  id: string;
  frame: number;
  label: string;
  color: string;
}

export interface OnionSkinConfig {
  enabled: boolean;
  prevFrames: number;
  nextFrames: number;
  opacity: number; // 0.05..0.8
  prevColor: string;
  nextColor: string;
}

export interface GuideConfig {
  grid: boolean;
  gridSize: number;
  perspective: boolean;
  safeArea: boolean;
  symmetry: SymmetryMode;
  radialSegments: number;
}

export interface Scene {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: 12 | 24 | 25 | 30;
  totalFrames: number;
  transparentBg: boolean;
  bgColor: string;
  layers: Layer[];
  rig: RigState;
  cameraKeyframes: CameraKeyframe[];
  effects: CompositeEffect[];
  audioTracks: AudioTrack[];
  markers: TimelineMarker[];
  references: ReferenceItem[];
}

export interface StudioProject {
  formatVersion: '1.0';
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  activeSceneId: string;
  scenes: Scene[];
  palette: string[];
  customBrushes: BrushPreset[];
}

export interface ProjectVersion {
  id: string;
  projectId: string;
  label: string;
  savedAt: string;
  snapshot: StudioProject;
}

export interface ShortcutMap {
  [action: string]: string;
}
