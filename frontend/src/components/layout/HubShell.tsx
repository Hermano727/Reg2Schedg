"use client";

import { useCallback, useState, type ReactNode } from "react";
import { authorizeGoogleCalendar, GoogleCalendarAuthorizationError, syncGoogleCalendarEvents } from "@/lib/api/calendar";
import { buildGoogleCalendarEvents } from "@/lib/mappers/googleCalendar";
import { createClient } from "@/lib/supabase/client";
import { CalendarSyncProvider, type CalendarSyncRequest } from "@/components/layout/calendar-sync-context";
import { CalendarStateProvider } from "@/components/layout/calendar-state-context";
import { Header } from "@/components/layout/Header";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import type { HubUser } from "@/types/hub-user";

type HubShellProps = {
  children: ReactNode;
  user: HubUser | null;
};

export function HubShell({ children, user }: HubShellProps) {
  const [onboardingDone, setOnboardingDone] = useState(
    !user?.needsOnboarding,
  );

  const handleSyncCalendar = useCallback(async (request: CalendarSyncRequest) => {
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error("Sign in to Reg2Schedg before syncing to Google Calendar.");
      }

      const events = buildGoogleCalendarEvents({
        classes: request.classes,
        commitments: request.commitments,
        courseLabels: request.courseLabels,
        scheduleTitle: request.scheduleTitle,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles",
      });

      if (events.length === 0) {
        throw new Error("There are no calendar entries to sync yet.");
      }

      let result;
      try {
        result = await syncGoogleCalendarEvents(token, events);
      } catch (error) {
        if (!(error instanceof GoogleCalendarAuthorizationError)) {
          throw error;
        }

        await authorizeGoogleCalendar(token);
        result = await syncGoogleCalendarEvents(token, events);
      }

      const failed = result.failed ?? 0;
      if (failed > 0) {
        alert(`Added ${result.count} Google Calendar events, but ${failed} item${failed === 1 ? "" : "s"} failed. You can try syncing again.`);
      } else {
        alert(`Added ${result.count} Google Calendar event${result.count === 1 ? "" : "s"} to your account.`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      alert(`Google Calendar sync error: ${msg}\n\nMake sure the API backend is running and GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are set in services/api/.env.`);
    }
  }, []);

  return (
    <CalendarStateProvider>
      <CalendarSyncProvider onSync={handleSyncCalendar}>
        <div className="flex min-h-screen flex-col">
          <Header user={user} />
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
        {!onboardingDone && user?.id && (
          <OnboardingFlow
            userId={user.id}
            onComplete={() => setOnboardingDone(true)}
          />
        )}
      </CalendarSyncProvider>
    </CalendarStateProvider>
  );
}
