"use client";

import { Maximize2, Plus, Redo2, RotateCcw, Undo2 } from "lucide-react";

type Props = {
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  onAdd: () => void;
  onFullscreen?: () => void;
};

export function ScheduleToolbar({ canUndo, canRedo, isDirty, onUndo, onRedo, onReset, onAdd, onFullscreen }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] pb-3">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-white/[0.08] bg-hub-bg/40 p-0.5">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo"
          className="rounded-md p-2 text-hub-text-muted transition hover:bg-hub-surface-elevated hover:text-hub-text active:scale-90 active:duration-75 disabled:pointer-events-none disabled:opacity-30"
        >
          <Undo2 className="h-4 w-4" aria-hidden />
          <span className="sr-only">Undo</span>
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo"
          className="rounded-md p-2 text-hub-text-muted transition hover:bg-hub-surface-elevated hover:text-hub-text active:scale-90 active:duration-75 disabled:pointer-events-none disabled:opacity-30"
        >
          <Redo2 className="h-4 w-4" aria-hidden />
          <span className="sr-only">Redo</span>
        </button>
      </div>
      <button
        type="button"
        onClick={onReset}
        title="Restore meetings to the last ingested plan"
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-hub-bg/35 px-3 py-2 text-xs font-medium text-hub-text-secondary transition hover:border-hub-cyan/30 hover:text-hub-text active:scale-[0.95] active:duration-75"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        Original schedule
      </button>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1.5 rounded-lg border border-hub-cyan/35 bg-hub-cyan/10 px-3 py-2 text-xs font-medium text-hub-cyan transition hover:bg-hub-cyan/15 active:scale-[0.95] active:duration-75"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Add block
      </button>
      {onFullscreen && (
        <button
          type="button"
          onClick={onFullscreen}
          title="Expand schedule to full screen"
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-hub-bg/55 px-2.5 py-2 text-xs font-medium text-hub-text-secondary transition hover:border-hub-cyan/25 hover:text-hub-text active:scale-[0.95] active:duration-75"
        >
          <Maximize2 className="h-3.5 w-3.5" aria-hidden />
          Full screen
        </button>
      )}
      {isDirty && (
        <span className="w-full basis-full text-[10px] text-hub-text-muted lg:basis-auto">
          Unsaved local edits — use Original schedule to discard all moves.
        </span>
      )}
    </div>
  );
}
