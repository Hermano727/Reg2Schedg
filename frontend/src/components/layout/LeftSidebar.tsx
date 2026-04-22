"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import {
  BookmarkCheck,
  FileText,
  FolderOpen,
  Home,
  MessageSquare,
  Plus,
  Settings,
  Search,
  Trash,
  Users,
  X,
} from "lucide-react";
import { vaultKindLabel } from "@/lib/hub/vault-map";
import type { VaultItem } from "@/types/dossier";
import { ClassLookupModal } from "@/components/lookup/ClassLookupModal";

export type SidebarPlanRow = {
  id: string;
  label: string;
  subtitle?: string;
  courseCount?: number;
  trendLabel?: string;
  fitnessScore?: number;
  fitnessMax?: number;
  updatedAt?: string;
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function trendColor(score: number | undefined): string {
  if (score == null) return "text-hub-text-muted";
  if (score >= 75) return "text-hub-success";
  if (score >= 50) return "text-hub-gold";
  return "text-hub-danger";
}

type LeftSidebarProps = {
  planSectionTitle: string;
  plans: SidebarPlanRow[];
  activePlanId: string;
  onSelectPlan: (id: string) => void;
  newPlanLabel: string;
  onNewPlan?: () => void;
  onDeletePlan?: (id: string) => void;
  onRenamePlan?: (id: string, newTitle: string) => void;
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

export function LeftSidebar({
  planSectionTitle,
  plans,
  activePlanId,
  onSelectPlan,
  newPlanLabel,
  onNewPlan,
  onDeletePlan,
  vaultItems,
  vaultSynced,
}: LeftSidebarProps) {
  const [activePanel, setActivePanel] = useState<ActivePanel | null>(null);
  // Tracks the last opened panel so content stays visible during slide-out
  const [shownPanel, setShownPanel] = useState<ActivePanel>("plans");
  const [lookupOpen, setLookupOpen] = useState(false);
  const railRef = useRef<HTMLElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setActivePanel(null), 20);
  }, [cancelClose]);

  function openPanel(panel: ActivePanel) {
    cancelClose();
    setShownPanel(panel);
    setActivePanel(panel);
  }

  // Clean up timer on unmount
  useEffect(() => () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); }, []);

  return (
    <>
      {/* Flyout panel — slides in from the left, starts from top */}
      <div
        ref={flyoutRef}
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        className={`fixed bottom-0 left-14 top-0 z-40 flex w-[280px] flex-col border-r border-white/[0.07] bg-[#0c1a2e]/95 shadow-2xl backdrop-blur-xl transition-transform duration-200 ease-out ${
          activePanel !== null ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={activePanel === null}
      >
        {/* Panel header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <p className="font-[family-name:var(--font-outfit)] text-[18px] font-semibold text-hub-text-muted">
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
                            <span className="min-w-0 truncate font-medium">{p.label}</span>
                            {active && (
                              <span className="shrink-0 text-[12px] font-semibold text-hub-cyan">
                                Active
                              </span>
                            )}
                          </span>
                          {p.subtitle && (
                            <span className="mt-1 text-[12px] text-hub-cyan/60">
                              {p.subtitle}
                            </span>
                          )}
                          {(p.trendLabel || p.updatedAt) && (
                            <span className="mt-2 flex flex-col gap-0.5">
                              {p.trendLabel && (
                                <span className={`text-[12px] font-medium ${trendColor(p.fitnessScore)}`}>
                                  {p.trendLabel}
                                </span>
                              )}
                              {p.updatedAt && (
                                <span className="text-[12px] text-hub-text-secondary/60">
                                  {relativeTime(p.updatedAt)}
                                </span>
                              )}
                            </span>
                          )}
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
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/[0.12] py-2 text-[12px] font-medium text-hub-text-secondary transition hover:border-hub-cyan/35 hover:text-hub-cyan disabled:pointer-events-none disabled:opacity-35"
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
                ? "Saved files and community attachments."
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
                    {item.kind === "community" && item.communityPostId ? (
                      // Community attachment save — links back to the post+comment
                      <a
                        href={`/community/${item.communityPostId}${item.communityReplyId ? `#reply-${item.communityReplyId}` : ""}`}
                        className="flex w-full flex-col gap-1.5 rounded-lg border border-hub-cyan/15 bg-hub-bg/40 p-3 transition hover:border-hub-cyan/35 hover:bg-hub-cyan/5"
                      >
                        <div className="flex items-center gap-1.5">
                          <MessageSquare className="h-3 w-3 shrink-0 text-hub-cyan/60" aria-hidden />
                          <span className="truncate text-[10px] font-medium text-hub-cyan/80">
                            {item.communityPostTitle ?? "Community post"}
                          </span>
                        </div>
                        {item.communityReplyPreview && (
                          <p className="line-clamp-2 text-[11px] italic text-hub-text-secondary/70">
                            &ldquo;{item.communityReplyPreview}&rdquo;
                          </p>
                        )}
                        {item.signedUrl && item.mimeType?.startsWith("image/") && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.signedUrl}
                            alt={item.name}
                            className="mt-0.5 h-20 w-full rounded object-cover"
                          />
                        )}
                        <span className="text-[10px] text-hub-text-muted">
                          {item.name} · <span className="text-hub-cyan/60">Go to comment →</span>
                        </span>
                      </a>
                    ) : item.signedUrl ? (
                      <a
                        href={item.signedUrl}
                        download={item.name}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex w-full items-start gap-2 rounded-lg border border-white/[0.06] bg-hub-bg/40 p-3 text-left transition hover:border-hub-cyan/30 hover:bg-hub-cyan/5"
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
                            <span className="text-hub-cyan/70">Download</span>
                          </span>
                        </span>
                      </a>
                    ) : (
                      <div className="flex w-full items-start gap-2 rounded-lg border border-white/[0.06] bg-hub-bg/40 p-3 text-left">
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
                          </span>
                        </span>
                      </div>
                    )}
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>

      {/* Layout placeholder — maintains 56px flex space while rail is fixed */}
      <div className="w-14 shrink-0" aria-hidden />

      {/* Icon rail — fixed full-height dock, covers sidebar column top-to-bottom */}
      <aside
        ref={railRef}
        onMouseEnter={() => openPanel(shownPanel)}
        onMouseLeave={scheduleClose}
        className="fixed top-0 left-0 z-50 flex h-dvh w-14 shrink-0 flex-col items-center gap-1 border-r border-white/[0.07] bg-[#091727]/90 backdrop-blur-xl py-3"
      >
        {/* Brand mark fills the header-height slot at the top of the rail */}
        <a
          href="/"
          className="mb-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-hub-surface/80 text-hub-cyan transition hover:border-hub-cyan/30"
          aria-label="Home"
        >
          <Home className="h-4 w-4" aria-hidden />
        </a>
        <div className="my-1 h-px w-6 bg-white/[0.06]" />
        <IconButton
          icon={BookmarkCheck}
          label="Saved plans"
          active={activePanel === "plans"}
          onClick={() => openPanel("plans")}
        />
        <IconButton
          icon={FolderOpen}
          label="Saved files"
          active={activePanel === "vault"}
          onClick={() => openPanel("vault")}
        />
        <IconButton
          icon={Search}
          label="Class lookup"
          onClick={() => setLookupOpen(true)}
        />
        <Link
          href="/community"
          aria-label="Community"
          title="Community"
          className="group relative flex h-10 w-10 items-center justify-center rounded-lg text-hub-text-muted transition hover:bg-white/[0.05] hover:text-hub-text"
        >
          <Users className="h-5 w-5" />
          <span
            className="pointer-events-none absolute left-full ml-2.5 whitespace-nowrap rounded-md border border-white/[0.1] bg-hub-surface-elevated px-2 py-1 text-xs text-hub-text opacity-0 shadow-lg transition-opacity delay-300 group-hover:opacity-100"
            aria-hidden
          >
            Community
          </span>
        </Link>
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
      <ClassLookupModal open={lookupOpen} onClose={() => setLookupOpen(false)} />
    </>
  );
}
