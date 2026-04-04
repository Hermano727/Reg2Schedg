"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { ChevronDown, LogOut, Settings, User } from "lucide-react";

type UserAccountMenuProps = {
  displayName?: string;
  email?: string;
};

const menuItemClass =
  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-hub-text outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-white/[0.06] data-[disabled]:text-hub-text-muted";

export function UserAccountMenu({
  displayName = "Guest",
  email = "Sign in when auth is wired",
}: UserAccountMenuProps) {
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex h-9 items-center gap-1 rounded-full border border-white/[0.12] bg-hub-surface-elevated pl-1 pr-1.5 text-[11px] font-semibold text-hub-text outline-none ring-hub-cyan/40 transition hover:border-white/[0.18] focus-visible:ring-2"
          aria-label="Open account menu"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-hub-cyan/10 text-[10px] text-hub-cyan ring-1 ring-hub-cyan/25">
            {initials}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-hub-text-muted" aria-hidden />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="glass-panel z-50 min-w-[220px] rounded-xl p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
          sideOffset={8}
          align="end"
        >
          <div className="border-b border-white/[0.08] px-2 py-2">
            <p className="truncate text-sm font-medium text-hub-text">
              {displayName}
            </p>
            <p className="truncate text-xs text-hub-text-muted">{email}</p>
          </div>

          <div className="py-1">
            <DropdownMenu.Item asChild className={menuItemClass}>
              <Link href="/profile">
                <User className="h-4 w-4 text-hub-text-muted" aria-hidden />
                My profile
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild className={menuItemClass}>
              <Link href="/settings">
                <Settings className="h-4 w-4 text-hub-text-muted" aria-hidden />
                Settings
              </Link>
            </DropdownMenu.Item>
          </div>

          <DropdownMenu.Separator className="my-1 h-px bg-white/[0.08]" />

          <DropdownMenu.Item
            className={menuItemClass}
            disabled
            title="Available after Supabase auth"
          >
            <LogOut className="h-4 w-4 text-hub-text-muted" aria-hidden />
            Sign out
            <span className="ml-auto text-[10px] font-medium uppercase tracking-wide text-hub-text-muted">
              Soon
            </span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
