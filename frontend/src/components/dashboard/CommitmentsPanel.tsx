"use client";

import type { ScheduleCommitment } from "@/types/dossier";

type Props = {
  commitments: ScheduleCommitment[];
  onRemove: (id: string) => void;
};

export function CommitmentsPanel({ commitments, onRemove }: Props) {
  if (commitments.length === 0) return null;
  return (
    <div className="rounded-lg border border-white/[0.06] bg-hub-bg/25 px-3 py-2">
      <p className="text-[10px] font-medium text-hub-text-muted/70">
        Your blocks
      </p>
      <ul className="mt-2 space-y-1.5">
        {commitments.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between gap-2 text-xs text-hub-text-secondary"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
              <span className="truncate font-medium text-hub-text">{c.title}</span>
            </span>
            <button
              type="button"
              onClick={() => onRemove(c.id)}
              className="shrink-0 rounded px-2 py-0.5 text-[10px] text-hub-text-muted hover:bg-white/5 hover:text-hub-danger"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
