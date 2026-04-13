"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BookmarkCheck,
  FileText,
  FolderOpen,
  Plus,
  Settings,
  Trash,
  X,
} from "lucide-react";
import { vaultKindLabel } from "@/lib/hub/vault-map";
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

type ActivePanel = "plans" | "vault";

function IconButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
        active
          ? "bg-hub-cyan/10 text-hub-cyan"
          : "text-hub-text-muted hover:bg-white/[0.05] hover:text-hub-text"
      }`}
    >
      <Icon className="h-5 w-5" />
      {/* Tooltip */}
      <span
        className="pointer-events-none absolute left-full ml-2.5 whitespace-nowrap rounded-md border border-white/[0.1] bg-hub-surface-elevated px-2 py-1 text-xs text-hub-text opacity-0 shadow-lg transition-opacity delay-300 group-hover:opacity-100"
        aria-hidden
      >
        {label}
      </span>
    </button>
  );
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
  const [activePanel, setActivePanel] = useState<ActivePanel | null>(null);
  // Tracks the last opened panel so content stays visible during slide-out
  const [shownPanel, setShownPanel] = useState<ActivePanel>("plans");
  const railRef = useRef<HTMLElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);

  function togglePanel(panel: ActivePanel) {
    if (activePanel === panel) {
      setActivePanel(null);
    } else {
      setShownPanel(panel);
      setActivePanel(panel);
    }
  }

  // Close flyout on click-outside
  useEffect(() => {
    if (!activePanel) return;
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        !railRef.current?.contains(target) &&
        !flyoutRef.current?.contains(target)
      ) {
        setActivePanel(null);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [activePanel]);

  return (
    <>
      {/* Flyout panel — fixed overlay, slides in from the left */}
      <div
        ref={flyoutRef}
        className={`fixed bottom-0 left-14 top-14 z-40 flex w-[280px] flex-col border-r border-white/[0.08] bg-hub-surface shadow-2xl transition-transform duration-200 ease-out ${
          activePanel !== null ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={activePanel === null}
      >
        {/* Panel header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <p className="font-[family-name:var(--font-outfit)] text-xs font-semibold text-hub-text-muted">
            {shownPanel === "plans" ? planSectionTitle : "Saved files"}
          </p>
          <button
            type="button"
            onClick={() => setActivePanel(null)}
            aria-label="Close panel"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-hub-text-muted transition hover:text-hub-text"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Plans panel */}
        {shownPanel === "plans" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
            <ul className="space-y-1">
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
        )}

        {/* Vault panel */}
        {shownPanel === "vault" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
            <p className="mb-3 text-[11px] leading-relaxed text-hub-text-muted">
              {vaultSynced
                ? "Your uploaded files for this plan."
                : "Please log in to view your saved files."}
            </p>
            <ul className="space-y-2">
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
        )}
      </div>

      {/* Icon rail — 56px wide, left edge of layout */}
      <aside
        ref={railRef}
        className="glass-panel relative z-50 flex w-14 shrink-0 flex-col items-center gap-1 border-r border-white/[0.08] py-3"
      >
        <IconButton
          icon={BookmarkCheck}
          label="Saved plans"
          active={activePanel === "plans"}
          onClick={() => togglePanel("plans")}
        />
        <IconButton
          icon={FolderOpen}
          label="Saved files"
          active={activePanel === "vault"}
          onClick={() => togglePanel("vault")}
        />
        <div className="flex-1" />
        <Link
          href="/settings"
          aria-label="Settings"
          title="Settings"
          className="group relative flex h-10 w-10 items-center justify-center rounded-lg text-hub-text-muted transition hover:bg-white/[0.05] hover:text-hub-text"
        >
          <Settings className="h-5 w-5" />
          <span
            className="pointer-events-none absolute left-full ml-2.5 whitespace-nowrap rounded-md border border-white/[0.1] bg-hub-surface-elevated px-2 py-1 text-xs text-hub-text opacity-0 shadow-lg transition-opacity delay-300 group-hover:opacity-100"
            aria-hidden
          >
            Settings
          </span>
        </Link>
      </aside>
    </>
  );
}
