import { AlertTriangle } from "lucide-react";
import type { ClassConflict } from "@/types/dossier";

type ConflictBadgeProps = {
  conflict: ClassConflict;
};

export function ConflictBadge({ conflict }: ConflictBadgeProps) {
  return (
    <div className="flex gap-3 rounded-xl border border-hub-gold/35 bg-hub-gold/[0.08] p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-hub-gold/15 text-hub-gold">
        <AlertTriangle className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-hub-gold">
          Conflict · {conflict.title}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-hub-text-secondary">
          {conflict.detail}
        </p>
      </div>
    </div>
  );
}
