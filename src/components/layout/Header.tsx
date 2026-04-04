"use client";

import Link from "next/link";
import { Bell, HelpCircle, Search } from "lucide-react";
import { UserAccountMenu } from "@/components/layout/UserAccountMenu";
import { TritonMark } from "@/components/ui/TritonMark";

type HeaderProps = {
  onSyncCalendar?: () => void;
};

export function Header({ onSyncCalendar }: HeaderProps) {
  return (
    <header className="glass-panel sticky top-0 z-30 flex h-14 shrink-0 items-center gap-4 border-b border-white/[0.08] px-4">
      <Link
        href="/"
        className="flex min-w-0 items-center gap-3 rounded-lg outline-none ring-hub-cyan/40 focus-visible:ring-2"
      >
        <TritonMark size={36} />
        <div className="min-w-0">
          <p className="font-[family-name:var(--font-outfit)] text-sm font-semibold tracking-tight text-hub-text">
            TritonHub
          </p>
          <p className="truncate text-[11px] text-hub-text-muted">
            Command Center
          </p>
        </div>
      </Link>

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
        <button
          type="button"
          onClick={onSyncCalendar}
          className="inline-flex h-9 items-center rounded-lg bg-hub-cyan/15 px-2.5 text-[11px] font-semibold text-hub-cyan ring-1 ring-hub-cyan/35 transition hover:bg-hub-cyan/25 sm:px-3 sm:text-xs"
        >
          <span className="sm:hidden">Sync</span>
          <span className="hidden sm:inline">Sync to Google Calendar</span>
        </button>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] text-hub-text-secondary transition hover:border-white/[0.14] hover:text-hub-text"
          aria-label="Help"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] text-hub-text-secondary transition hover:border-white/[0.14] hover:text-hub-text"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-hub-cyan shadow-[0_0_8px_rgba(0,212,255,0.8)]" />
        </button>
        <UserAccountMenu />
      </div>
    </header>
  );
}
