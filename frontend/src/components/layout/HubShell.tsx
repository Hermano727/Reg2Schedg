"use client";

import { useCallback, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { getApiBaseUrl } from "@/lib/api/client";
import { CalendarSyncProvider } from "@/components/layout/calendar-sync-context";
import { CalendarStateProvider } from "@/components/layout/calendar-state-context";
import { Header } from "@/components/layout/Header";
import type { HubUser } from "@/types/hub-user";

type HubShellProps = {
  children: ReactNode;
  user: HubUser | null;
};

export function HubShell({ children, user }: HubShellProps) {
  const handleSyncCalendar = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      console.log("supabase session", session);
      console.log("access token", token);

      const res = await fetch(`${getApiBaseUrl()}/api/calendar/authorize`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      console.log("calendar authorize response status", res.status);
      console.log("calendar authorize response headers", Object.fromEntries(res.headers.entries()));

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("calendar authorize failed:", res.status, body);
        const err = (() => {
          try {
            return JSON.parse(body);
          } catch {
            return {};
          }
        })();
        throw new Error((err as { detail?: string }).detail ?? `Authorization failed (status ${res.status})`);
      }

      const { url } = (await res.json()) as { url: string };
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      alert(`Google Calendar sync error: ${msg}\n\nMake sure the API backend is running and GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are set in services/api/.env`);
    }
  }, []);

  return (
    <CalendarStateProvider>
      <CalendarSyncProvider onSync={handleSyncCalendar}>
        <div className="flex min-h-screen flex-col">
          <Header user={user} />
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
      </CalendarSyncProvider>
    </CalendarStateProvider>
  );
}
