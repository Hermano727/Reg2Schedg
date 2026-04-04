"use client";

import { FileText, FolderOpen, Plus } from "lucide-react";
import type { QuarterRef, VaultItem } from "@/types/dossier";

type RightSidebarProps = {
  quarters: QuarterRef[];
  activeQuarterId: string;
  onSelectQuarter: (id: string) => void;
  vaultItems: VaultItem[];
};

function vaultKindLabel(kind: VaultItem["kind"]) {
  switch (kind) {
    case "syllabus":
      return "Syllabus";
    case "webreg":
      return "WebReg";
    default:
      return "Note";
  }
}

export function RightSidebar({
  quarters,
  activeQuarterId,
  onSelectQuarter,
  vaultItems,
}: RightSidebarProps) {
  return (
    <aside className="glass-panel flex w-[260px] shrink-0 flex-col border-l border-white/[0.08]">
      <div className="border-b border-white/[0.06] p-4">
        <p className="font-[family-name:var(--font-outfit)] text-xs font-semibold uppercase tracking-[0.14em] text-hub-text-muted">
          My Quarters
        </p>
        <ul className="mt-3 space-y-1">
          {quarters.map((q) => {
            const active = q.id === activeQuarterId;
            return (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => onSelectQuarter(q.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                    active
                      ? "border-l-2 border-hub-cyan bg-white/[0.04] text-hub-text"
                      : "border-l-2 border-transparent text-hub-text-secondary hover:bg-white/[0.03]"
                  }`}
                >
                  <span>{q.label}</span>
                  {active ? (
                    <span className="text-[10px] font-medium text-hub-cyan">
                      Active
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/[0.12] py-2 text-xs font-medium text-hub-text-secondary transition hover:border-hub-cyan/35 hover:text-hub-cyan"
        >
          <Plus className="h-3.5 w-3.5" />
          New quarter research
        </button>
      </div>

      <div className="flex flex-1 flex-col p-4 min-h-0">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-hub-cyan" aria-hidden />
          <p className="font-[family-name:var(--font-outfit)] text-xs font-semibold uppercase tracking-[0.14em] text-hub-text-muted">
            Resource Vault
          </p>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-hub-text-muted">
          Local snapshots of syllabi and WebReg exports. Wire to Supabase for
          cross-device sync later.
        </p>
        <ul className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
          {vaultItems.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex w-full items-start gap-2 rounded-lg border border-white/[0.06] bg-hub-bg/40 p-3 text-left transition hover:border-white/[0.12]"
              >
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-hub-text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-hub-text">
                    {item.name}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-[10px] text-hub-text-muted">
                    <span>{vaultKindLabel(item.kind)}</span>
                    <span aria-hidden>·</span>
                    <span>Updated {item.updatedAt}</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
