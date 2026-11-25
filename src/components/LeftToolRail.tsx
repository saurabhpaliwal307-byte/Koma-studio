import React, { useState } from 'react';
import {
  Brush,
  Circle,
  Eraser,
  Hand,
  Lasso,
  Minus,
  Move,
  PaintBucket,
  PenTool,
  Pencil,
  Pipette,
  Search,
  Square,
  Type as TypeIcon,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { BrushPreset, StudioMode, ToolId } from '../engine/types';

interface LeftToolRailProps {
  activeTool: ToolId;
  activeColor: string;
  brushPreset: BrushPreset;
  studioMode: StudioMode;
  onSelectTool: (tool: ToolId) => void;
  onUpdateBrush: (patch: Partial<BrushPreset>) => void;
  onOpenColorTab: () => void;
}

const ALL_TOOLS: {
  id: ToolId;
  label: string;
  shortcut: string;
  essential: boolean;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'pencil', label: 'Pencil', shortcut: 'B', essential: true, Icon: Pencil },
  { id: 'brush', label: 'Brush', shortcut: 'P', essential: true, Icon: Brush },
  { id: 'pen', label: 'Ink Pen', shortcut: 'N', essential: true, Icon: PenTool },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', essential: true, Icon: Eraser },
  { id: 'fill', label: 'Fill Bucket', shortcut: 'G', essential: true, Icon: PaintBucket },
  { id: 'line', label: 'Line', shortcut: 'L', essential: false, Icon: Minus },
  { id: 'rect', label: 'Rectangle', shortcut: 'R', essential: true, Icon: Square },
  { id: 'ellipse', label: 'Ellipse', shortcut: 'O', essential: false, Icon: Circle },
  { id: 'lasso', label: 'Lasso Select', shortcut: 'Q', essential: false, Icon: Lasso },
  { id: 'transform', label: 'Transform', shortcut: 'V', essential: true, Icon: Move },
  { id: 'eyedropper', label: 'Eyedropper', shortcut: 'I', essential: false, Icon: Pipette },
  { id: 'text', label: 'Text', shortcut: 'T', essential: false, Icon: TypeIcon },
  { id: 'hand', label: 'Hand Pan', shortcut: 'H', essential: true, Icon: Hand },
  { id: 'zoom', label: 'Zoom', shortcut: 'Z', essential: false, Icon: Search },
];

export const LeftToolRail: React.FC<LeftToolRailProps> = ({
  activeTool,
  activeColor,
  brushPreset,
  studioMode,
  onSelectTool,
  onUpdateBrush,
  onOpenColorTab,
}) => {
  const [showAllInBeginner, setShowAllInBeginner] = useState(false);

  const visibleTools =
    studioMode === 'beginner' && !showAllInBeginner
      ? ALL_TOOLS.filter((t) => t.essential)
      : ALL_TOOLS;

  return (
    <aside
      aria-label="Drawing and Selection Tools"
      className="w-12 sm:w-[78px] shrink-0 h-full flex flex-col items-center justify-between py-2 bg-[var(--studio-surface)] border-r border-[var(--studio-border)] select-none overflow-y-auto"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 w-full px-1.5">
        {visibleTools.map(({ id, label, shortcut, Icon }) => {
          const isActive = activeTool === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTool(id)}
              aria-label={`${label} (${shortcut})`}
              aria-pressed={isActive}
              title={`${label} (${shortcut})`}
              className={`w-full h-8 flex items-center justify-center rounded transition-colors ${
                isActive
                  ? 'bg-[#8B7CFF] text-white shadow-sm'
                  : 'text-[var(--studio-text-muted)] hover:text-[var(--studio-text)] hover:bg-[var(--studio-panel)]'
              }`}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}

        {studioMode === 'beginner' && (
          <button
            type="button"
            onClick={() => setShowAllInBeginner((v) => !v)}
            aria-label={showAllInBeginner ? 'Show Fewer Tools' : 'Show More Tools'}
            title={showAllInBeginner ? 'Fewer Tools' : 'All Tools'}
            className="sm:col-span-2 w-full h-7 flex items-center justify-center rounded text-[var(--studio-text-muted)] hover:text-[var(--studio-text)] hover:bg-[var(--studio-panel)]"
          >
            {showAllInBeginner ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>

      {/* Quick Size & Active Color Swatch */}
      <div className="flex flex-col items-center gap-2 pt-2 border-t border-[var(--studio-border)] w-full px-1.5 shrink-0">
        <div className="flex flex-col items-center w-full gap-0.5">
          <span className="font-mono tabular-nums text-[10px] text-[var(--studio-text-muted)]">
            {brushPreset.size}px
          </span>
          <input
            type="range"
            min={1}
            max={72}
            value={brushPreset.size}
            aria-label="Quick Brush Size"
            onChange={(e) => onUpdateBrush({ size: Number(e.target.value) })}
            className="w-9 sm:w-14 accent-[#8B7CFF] cursor-pointer"
          />
        </div>

        <button
          type="button"
          onClick={onOpenColorTab}
          aria-label={`Active Color ${activeColor}`}
          title={`Active Color: ${activeColor}`}
          className="w-8 h-8 rounded border-2 border-[var(--studio-border)] shadow-inner transition-transform hover:scale-105"
          style={{ backgroundColor: activeColor }}
        />
      </div>
    </aside>
  );
};
