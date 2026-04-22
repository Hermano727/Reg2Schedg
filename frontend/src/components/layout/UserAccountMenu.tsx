"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { LogOut, Send, Settings, User } from "lucide-react";
import { clientSignOut } from "@/lib/auth/client-sign-out";

const USER_ACCOUNT_MENU_TRIGGER_ID = "user-account-menu-trigger";
const USER_ACCOUNT_MENU_CONTENT_ID = "user-account-menu-content";

type UserAccountMenuProps = {
  displayName?: string;
  email?: string;
  signedIn?: boolean;
  avatarUrl?: string | null;
};

const menuItemClass =
  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-hub-text outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-white/[0.06] data-[disabled]:text-hub-text-muted";

export function UserAccountMenu({
  displayName = "Guest",
  signedIn = false,
  avatarUrl,
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
          id={USER_ACCOUNT_MENU_TRIGGER_ID}
          className="flex h-8 w-8 items-center justify-center rounded-full outline-none ring-hub-cyan/40 transition focus-visible:ring-2"
          aria-label="Open account menu"
          aria-controls={USER_ACCOUNT_MENU_CONTENT_ID}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={displayName}
              className="h-8 w-8 rounded-full object-cover ring-1 ring-hub-cyan/25"
            />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-hub-cyan/10 text-[10px] font-semibold text-hub-cyan ring-1 ring-hub-cyan/25">
              {initials}
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          id={USER_ACCOUNT_MENU_CONTENT_ID}
          aria-labelledby={USER_ACCOUNT_MENU_TRIGGER_ID}
          className="glass-panel z-50 min-w-[220px] rounded-xl p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
          sideOffset={8}
          align="end"
        >
          <div className="border-b border-white/[0.08] px-2 py-2">
            <p className="truncate text-sm font-medium text-hub-text">
              {displayName}
            </p>
          </div>

          <div className="py-1">
            {!signedIn ? (
              <DropdownMenu.Item asChild className={menuItemClass}>
                <Link href="/login">
                  <User className="h-4 w-4 text-hub-text-muted" aria-hidden />
                  Sign in
                </Link>
              </DropdownMenu.Item>
            ) : (
              <>
                <DropdownMenu.Item asChild className={menuItemClass}>
                  <Link href="/profile">
                    <User className="h-4 w-4 text-hub-text-muted" aria-hidden />
                    My profile
                  </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Item asChild className={menuItemClass}>
                  <Link href="/settings">
                    <Settings
                      className="h-4 w-4 text-hub-text-muted"
                      aria-hidden
                    />
                    Settings
                  </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Item asChild className={menuItemClass}>
                  <Link href="/profile?section=feedback">
                    <Send className="h-4 w-4 text-hub-text-muted" aria-hidden />
                    Feedback
                  </Link>
                </DropdownMenu.Item>
              </>
            )}
          </div>

          {signedIn ? (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-white/[0.08]" />
              <DropdownMenu.Item
                className={menuItemClass}
                onSelect={(e) => {
                  e.preventDefault();
                  void clientSignOut("/login");
                }}
              >
                <LogOut className="h-4 w-4 text-hub-text-muted" aria-hidden />
                Sign out
              </DropdownMenu.Item>
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
