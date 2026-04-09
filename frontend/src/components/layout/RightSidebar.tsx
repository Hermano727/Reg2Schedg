"use client";

import { CalendarDays, FileText, FolderOpen, Plus, Trash } from "lucide-react";
import { useCalendarState } from "@/components/layout/calendar-state-context";
import type { VaultItem } from "@/types/dossier";

export type SidebarPlanRow = {
  id: string;
  label: string;
  subtitle?: string;
};

type RightSidebarProps = {
  planSectionTitle: string;
  plans: SidebarPlanRow[];
  activePlanId: string;
  onSelectPlan: (id: string) => void;
  newPlanLabel: string;
  onNewPlan?: () => void;
  onDeletePlan?: (id: string) => void;
  vaultItems: VaultItem[];
  vaultSynced: boolean;
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
  planSectionTitle,
  plans,
  activePlanId,
  onSelectPlan,
  newPlanLabel,
  onNewPlan,
  onDeletePlan,
  vaultItems,
  vaultSynced,
}: RightSidebarProps) {
  const { calendarVisible, openCalendar } = useCalendarState();

  return (
    <aside className="glass-panel flex w-[260px] shrink-0 flex-col border-l border-white/[0.08]">
      {!calendarVisible && (
        <div className="border-b border-white/[0.06] p-3">
          <button
            type="button"
            onClick={openCalendar}
            className="flex w-full items-center gap-2.5 rounded-lg border border-hub-cyan/30 bg-hub-cyan/8 px-3 py-2.5 text-xs font-semibold text-hub-cyan transition hover:bg-hub-cyan/14"
          >
            <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
            Open weekly schedule
          </button>
        </div>
      )}

      <div className="border-b border-white/[0.06] p-4">
        <p className="font-[family-name:var(--font-outfit)] text-xs font-semibold text-hub-text-muted">
          {planSectionTitle}
        </p>
        <ul className="mt-3 space-y-1">
          {!vaultSynced ? (
            <li>
              <div className="rounded-xl border border-white/[0.06] bg-hub-bg/40 px-4 py-6 text-center text-sm text-hub-text-muted">
                Please log in to view saved plans.
              </div>
            </li>
          ) : (
            plans.map((p) => {
              const active = p.id === activePlanId;
              return (
                <li key={p.id}>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectPlan(p.id)}
                      className={`flex flex-1 flex-col rounded-lg px-3 py-2 text-left text-sm transition ${
                        active
                          ? "border-l-2 border-hub-cyan bg-white/[0.04] text-hub-text"
                          : "border-l-2 border-transparent text-hub-text-secondary hover:bg-white/[0.03]"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">{p.label}</span>
                        {active ? (
                          <span className="shrink-0 text-[10px] font-medium text-hub-cyan">
                            Active
                          </span>
                        ) : null}
                      </span>
                      {p.subtitle ? (
                        <span className="mt-0.5 text-[10px] text-hub-text-muted">
                          {p.subtitle}
                        </span>
                      ) : null}
                    </button>
                    {onDeletePlan ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeletePlan(p.id);
                        }}
                        title="Delete plan"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-hub-text-secondary hover:text-red-400"
                      >
                        <Trash className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })
          )}
        </ul>
        <button
          type="button"
          onClick={() => onNewPlan?.()}
          disabled={!onNewPlan}
          title={!onNewPlan ? "Sign in to create a saved plan" : undefined}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/[0.12] py-2 text-xs font-medium text-hub-text-secondary transition hover:border-hub-cyan/35 hover:text-hub-cyan disabled:pointer-events-none disabled:opacity-35"
        >
          <Plus className="h-3.5 w-3.5" />
          {newPlanLabel}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-hub-cyan" aria-hidden />
          <p className="font-[family-name:var(--font-outfit)] text-xs font-semibold text-hub-text-muted">
            Saved files
          </p>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-hub-text-muted">
          {vaultSynced
            ? "Your uploaded files for this plan."
            : "Please log in to view your saved files."}
        </p>
        <ul className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
          {!vaultSynced ? (
            <li className="rounded-lg border border-white/[0.06] bg-hub-bg/40 px-3 py-6 text-center text-[11px] text-hub-text-muted">
              Please log in to view vault items.
            </li>
          ) : vaultItems.length === 0 ? (
            <li className="rounded-lg border border-white/[0.06] bg-hub-bg/30 px-3 py-4 text-center text-[11px] text-hub-text-muted">
              No vault items yet.
            </li>
          ) : (
            vaultItems.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 rounded-lg border border-white/[0.06] bg-hub-bg/40 p-3 text-left transition hover:border-white/[0.12]"
                >
                  <FileText
                    className="mt-0.5 h-4 w-4 shrink-0 text-hub-text-muted"
                    aria-hidden
                  />
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
            ))
          )}
        </ul>
      </div>
    </aside>
  );
}
