"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, HelpCircle, Search, Users } from "lucide-react";
import { UserAccountMenu } from "@/components/layout/UserAccountMenu";
import { TritonMark } from "@/components/ui/TritonMark";
import { getNotifications, markNotificationsRead } from "@/lib/api/community";
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
  const [notifications, setNotifications] = useState<NotificationOut[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch notifications on mount (only when signed in)
  useEffect(() => {
    if (!user) return;
    getNotifications()
      .then((items) => {
        setNotifications(items);
        setUnreadCount(items.filter((n) => !n.read).length);
      })
      .catch(() => {
        // silently fail — notifications are non-critical
      });
  }, [user]);

  // Close dropdown on click-outside
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

  return (
    <header className="glass-panel sticky top-0 z-30 flex h-14 shrink-0 items-center gap-4 border-b border-white/[0.08] px-4">
      <a
        href="/"
        className="flex min-w-0 items-center gap-3 rounded-lg outline-none ring-hub-cyan/40 focus-visible:ring-2"
      >
        {/* Icon container lifts the logo off the glass navbar surface */}
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-white/[0.12] bg-hub-surface shadow-[0_0_14px_rgba(0,212,255,0.10),inset_0_1px_0_rgba(255,255,255,0.07)]">
          <TritonMark size={30} />
        </div>
        <div className="min-w-0">
          <p className="font-[family-name:var(--font-outfit)] text-base font-bold tracking-tight text-hub-text">
            Reg2Schedg
          </p>
        </div>
      </a>

      <div className="mx-auto flex max-w-xl flex-1 justify-center px-2">
        <label className="relative w-full">
          <span className="sr-only">Global search</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-hub-text-muted"
            aria-hidden
          />
          <input
            type="search"
            placeholder="Search courses, professors, quarters…"
            className="h-10 w-full rounded-lg border border-white/[0.08] bg-hub-bg/80 pl-9 pr-3 text-sm text-hub-text outline-none ring-hub-cyan/40 placeholder:text-hub-text-muted focus:border-hub-cyan/40 focus:ring-2"
          />
        </label>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Link
          href="/community"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hub-cyan/25 bg-hub-cyan/5 px-3 text-sm font-medium text-hub-cyan transition hover:border-hub-cyan/50 hover:bg-hub-cyan/10"
        >
          <Users className="h-4 w-4" />
          Community
        </Link>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] text-hub-text transition hover:border-hub-cyan/30 hover:text-hub-cyan"
          aria-label="Help"
        >
          <HelpCircle className="h-4 w-4" />
        </button>

        {/* Notification bell */}
        <div className="relative">
          <button
            ref={bellRef}
            type="button"
            onClick={handleBellClick}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] text-hub-text transition hover:border-hub-cyan/30 hover:text-hub-cyan"
            aria-label="Notifications"
            aria-expanded={dropdownOpen}
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-hub-cyan shadow-[0_0_8px_rgba(0,212,255,0.8)]" />
            )}
          </button>

          {/* Dropdown */}
          {dropdownOpen && (
            <div
              ref={dropdownRef}
              className="absolute right-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-xl border border-white/[0.1] bg-hub-surface-elevated shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
                <p className="text-xs font-semibold text-hub-text-muted">Notifications</p>
                {notifications.length > 0 && (
                  <span className="text-[10px] text-hub-text-muted">
                    {notifications.length} total
                  </span>
                )}
              </div>
              <ul className="max-h-72 overflow-y-auto">
                {notifications.length === 0 ? (
                  <li className="px-4 py-6 text-center text-sm text-hub-text-muted">
                    No notifications yet.
                  </li>
                ) : (
                  notifications.slice(0, 10).map((n) => (
                    <li key={n.id} className="border-b border-white/[0.04] last:border-0">
                      <div className="px-4 py-3">
                        <p className="text-xs text-hub-text-secondary">
                          {notificationMessage(n)}
                        </p>
                        <p className="mt-0.5 text-[10px] text-hub-text-muted">
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
        />
      </div>
    </header>
  );
}
