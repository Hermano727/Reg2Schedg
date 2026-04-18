"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, HelpCircle, Users } from "lucide-react";
import { UserAccountMenu } from "@/components/layout/UserAccountMenu";
import { TritonMark } from "@/components/ui/TritonMark";
import { CommandPalette, CommandPaletteTrigger, useCommandPalette } from "@/components/layout/CommandPalette";
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
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette();

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
    <>
      <header className="glass-panel sticky top-0 z-30 flex h-14 shrink-0 items-center border-b border-white/[0.07] pl-[72px] pr-4">
        {/* Brand — offset to clear sidebar rail */}
        <a
          href="/"
          className="flex min-w-0 items-center gap-2.5 rounded-md outline-none ring-hub-cyan/40 focus-visible:ring-2"
        >
          <TritonMark size={42} />
        </a>

        {/* Cmd+K search trigger — absolutely centered in the full header */}
        <div className="pointer-events-none absolute inset-x-0 flex justify-center">
          <div className="pointer-events-auto w-full max-w-sm px-4">
            <CommandPaletteTrigger onClick={() => setPaletteOpen(true)} />
          </div>
        </div>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/community"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 text-xs font-medium text-white/70 transition hover:border-white/[0.14] hover:text-white/90 active:scale-[0.98]"
          >
            <Users className="h-3.5 w-3.5" />
            Community
          </Link>

          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] text-white/50 transition hover:border-white/[0.14] hover:text-white/80"
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
              className="relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] text-white/50 transition hover:border-white/[0.14] hover:text-white/80"
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
          />
        </div>
      </header>

      {/* Command palette — rendered at top level, accessible from anywhere */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
    </>
  );
}
