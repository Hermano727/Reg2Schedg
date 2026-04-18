"use client";

import Link from "next/link";
import { Home, Settings } from "lucide-react";

export function CommunityNavRail() {
  return (
    <>
      {/* Placeholder keeps siblings from sliding under the fixed rail */}
      <div className="w-14 shrink-0" aria-hidden />

      <aside className="fixed left-0 top-0 z-50 flex h-dvh w-14 shrink-0 flex-col items-center gap-1 border-r border-white/[0.07] bg-[#091727]/90 py-3 backdrop-blur-xl">
        <a
          href="/"
          aria-label="Home"
          className="mb-2 flex h-9 w-9 items-center justify-center rounded-md border border-white/[0.08] bg-hub-surface/80 text-hub-cyan transition hover:border-hub-cyan/30"
        >
          <Home className="h-4 w-4" aria-hidden />
        </a>

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
