"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Eye, EyeOff, HelpCircle, Users } from "lucide-react";
import { UserAccountMenu } from "@/components/layout/UserAccountMenu";
import { TritonMark } from "@/components/ui/TritonMark";
import { CommandPalette, CommandPaletteTrigger, useCommandPalette } from "@/components/layout/CommandPalette";
import { ClassLookupModal } from "@/components/lookup/ClassLookupModal";
import { getNotifications, markNotificationsRead } from "@/lib/api/community";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/community/utils";
import type { NotificationOut } from "@/types/community";
import type { HubUser } from "@/types/hub-user";

type HeaderProps = {
  user: HubUser | null;
};

function notificationMessage(n: NotificationOut): string {
  if (n.type === "upvote") {
    const title = (n.payload?.post_title as string | undefined) ?? "your post";
    return `"${title}" was upvoted`;
  }
  return "You have a new notification";
}

export function Header({ user }: HeaderProps) {
  const pathname = usePathname();
  const isSettingsPage = pathname.startsWith("/profile") || pathname.startsWith("/settings");
  const isCommunityPage = pathname.startsWith("/community");
  const [notifications, setNotifications] = useState<NotificationOut[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette();
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupProfessorName, setLookupProfessorName] = useState("");
  const [lookupAutoSearchOnOpen, setLookupAutoSearchOnOpen] = useState(false);
  const [showSubmissionQuota, setShowSubmissionQuota] = useState(user?.submissionQuota?.showInHeader ?? true);
  const [submissionQuotaSaving, setSubmissionQuotaSaving] = useState(false);
  const hasSubmissionQuota = !!user?.submissionQuota;
  const submissionQuota = user?.submissionQuota ?? null;
  const submissionLabel = submissionQuota?.submissionsRemaining === 1 ? "submission" : "submissions";

  useEffect(() => {
    function handleLookupOpen(event: Event) {
      const customEvent = event as CustomEvent<{ query?: string; professorName?: string; autoSearch?: boolean }>;
      setLookupQuery(customEvent.detail?.query?.trim() ?? "");
      setLookupProfessorName(customEvent.detail?.professorName?.trim() ?? "");
      setLookupAutoSearchOnOpen(customEvent.detail?.autoSearch === true);
      setLookupOpen(true);
    }

    window.addEventListener("hub:open-lookup", handleLookupOpen as EventListener);
    return () => window.removeEventListener("hub:open-lookup", handleLookupOpen as EventListener);
  }, []);

  useEffect(() => {
    if (!user) return;
    getNotifications()
      .then((items) => {
        setNotifications(items);
        setUnreadCount(items.filter((n) => !n.read).length);
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    setShowSubmissionQuota(user?.submissionQuota?.showInHeader ?? true);
  }, [user?.submissionQuota?.showInHeader, user?.id]);

  useEffect(() => {
    const onPreferencesUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ showSubmissionQuotaInHeader?: boolean }>;
      if (typeof customEvent.detail?.showSubmissionQuotaInHeader === "boolean") {
        setShowSubmissionQuota(customEvent.detail.showSubmissionQuotaInHeader);
      }
    };
    window.addEventListener("hub:profile-preferences-updated", onPreferencesUpdated as EventListener);
    return () => window.removeEventListener("hub:profile-preferences-updated", onPreferencesUpdated as EventListener);
  }, []);

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        !bellRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [dropdownOpen]);

  function handleBellClick() {
    if (!dropdownOpen && unreadCount > 0) {
      setUnreadCount(0);
      markNotificationsRead().catch(() => {});
    }
    setDropdownOpen((v) => !v);
  }

  async function handleToggleSubmissionQuota(next: boolean) {
    if (!user?.id || submissionQuotaSaving) return;
    const previous = showSubmissionQuota;
    setShowSubmissionQuota(next);
    setSubmissionQuotaSaving(true);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ show_submission_quota_in_header: next })
        .eq("id", user.id);
      if (error) throw error;
      window.dispatchEvent(new CustomEvent("hub:profile-preferences-updated", {
        detail: { showSubmissionQuotaInHeader: next },
      }));
    } catch {
      setShowSubmissionQuota(previous);
    } finally {
      setSubmissionQuotaSaving(false);
    }
  }

  return (
    <>
      <header className={`glass-panel sticky top-0 z-30 flex h-14 shrink-0 items-center border-b border-white/[0.07] pr-4 ${isSettingsPage ? "pl-6" : "pl-[72px]"}`}>
        {/* Brand — offset to clear sidebar rail */}
        <Link
          href="/"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("hub:go-home"));
          }}
          className="flex min-w-0 items-center gap-2.5 rounded-md outline-none ring-hub-cyan/40 focus-visible:ring-2"
        >
          <TritonMark size={42} />
        </Link>

        {/* Cmd+K search trigger — absolutely centered in the full header */}
        <div className="pointer-events-none absolute inset-x-0 flex justify-center">
          <div className="pointer-events-auto w-full max-w-sm px-4">
            <CommandPaletteTrigger onClick={() => setPaletteOpen(true)} />
          </div>
        </div>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-1">
          {hasSubmissionQuota && showSubmissionQuota && submissionQuota && (
            <div className="hidden items-center gap-1.5 rounded-md border border-white/[0.10] bg-white/[0.03] px-2.5 py-1 md:flex">
              <span className="text-[11px] text-hub-text-secondary">
                {submissionQuota.submissionsRemaining} {submissionLabel} left until {submissionQuota.resetsAtLabel}
              </span>
              <button
                type="button"
                onClick={() => void handleToggleSubmissionQuota(false)}
                disabled={submissionQuotaSaving}
                className="rounded p-0.5 text-hub-text-muted transition hover:text-hub-text disabled:opacity-50"
                aria-label="Hide submission quota"
              >
                <EyeOff className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {hasSubmissionQuota && !showSubmissionQuota && (
            <button
              type="button"
              onClick={() => void handleToggleSubmissionQuota(true)}
              disabled={submissionQuotaSaving}
              className="hidden items-center gap-1.5 rounded-md border border-white/[0.10] px-2 py-1 text-[11px] text-hub-text-muted transition hover:text-hub-text disabled:opacity-50 md:inline-flex"
            >
              <Eye className="h-3.5 w-3.5" />
              Show submissions
            </button>
          )}

          <Link
            href="/community"
            aria-current={isCommunityPage ? "page" : undefined}
            className={[
              "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold tracking-[0.02em] transition-all duration-150 active:scale-[0.98]",
              isCommunityPage
                ? "bg-hub-cyan/18 text-hub-cyan"
                : "bg-hub-cyan/10 text-hub-cyan/85 hover:bg-hub-cyan/16 hover:text-hub-cyan",
            ].join(" ")}
          >
            <Users className="h-3.5 w-3.5" />
            Community
          </Link>

          <div className="mx-1 h-5 w-px bg-white/[0.10]" aria-hidden />

          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/60 transition hover:bg-white/[0.05] hover:text-white/80"
            aria-label="Help"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>

          {/* Notification bell */}
          <div className="relative">
            <button
              ref={bellRef}
              type="button"
              onClick={handleBellClick}
              className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-white/60 transition hover:bg-white/[0.05] hover:text-white/80"
              aria-label="Notifications"
              aria-expanded={dropdownOpen}
            >
              <Bell className="h-3.5 w-3.5" />
              {unreadCount > 0 && (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-hub-cyan shadow-[0_0_8px_rgba(0,212,255,0.8)]" />
              )}
            </button>

            {dropdownOpen && (
              <div
                ref={dropdownRef}
                className="absolute right-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-xl border border-white/[0.1] bg-hub-surface-elevated shadow-2xl"
              >
                <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-white/40">Notifications</p>
                  {notifications.length > 0 && (
                    <span className="text-[10px] text-white/30">
                      {notifications.length} total
                    </span>
                  )}
                </div>
                <ul className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <li className="px-4 py-6 text-center text-sm text-white/40">
                      Nothing yet.
                    </li>
                  ) : (
                    notifications.slice(0, 10).map((n) => (
                      <li key={n.id} className="border-b border-white/[0.04] last:border-0">
                        <div className="px-4 py-3">
                          <p className="text-xs text-white/80">
                            {notificationMessage(n)}
                          </p>
                          <p className="mt-0.5 text-[10px] text-white/40">
                            {timeAgo(n.createdAt)}
                          </p>
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}
          </div>

          <UserAccountMenu
            displayName={user?.displayName}
            email={user?.email}
            signedIn={!!user}
            avatarUrl={user?.avatarUrl}
            submissionQuota={user?.submissionQuota ?? null}
          />
        </div>
      </header>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenLookup={(q) => {
          setPaletteOpen(false);
          setLookupQuery(q);
          setLookupProfessorName("");
          setLookupAutoSearchOnOpen(false);
          setLookupOpen(true);
        }}
      />

      <ClassLookupModal
        open={lookupOpen}
        onClose={() => {
          setLookupOpen(false);
          setLookupAutoSearchOnOpen(false);
        }}
        initialQuery={lookupQuery}
        initialProfessorName={lookupProfessorName}
        autoSearchOnOpen={lookupAutoSearchOnOpen}
      />
    </>
  );
}
