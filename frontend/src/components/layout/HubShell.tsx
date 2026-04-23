"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  authorizeGoogleCalendar,
  GOOGLE_CALENDAR_TOAST_EVENT,
  GoogleCalendarAuthorizationError,
  syncGoogleCalendarEvents,
} from "@/lib/api/calendar";
import { buildGoogleCalendarEvents } from "@/lib/mappers/googleCalendar";
import { HubToast, type ToastPayload } from "@/components/ui/HubToast";
import { createClient } from "@/lib/supabase/client";
import { CalendarSyncProvider, type CalendarSyncRequest } from "@/components/layout/calendar-sync-context";
import { CalendarStateProvider } from "@/components/layout/calendar-state-context";
import { Header } from "@/components/layout/Header";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { FeedbackModal } from "@/components/feedback/FeedbackModal";
import type { HubUser } from "@/types/hub-user";

type HubShellProps = {
  children: ReactNode;
  user: HubUser | null;
};

export function HubShell({ children, user }: HubShellProps) {
  const [onboardingDone, setOnboardingDone] = useState(
    !user?.needsOnboarding,
  );
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackArea, setFeedbackArea] = useState<"command_center" | "profile" | "community" | "calendar" | "lookup" | "other">("other");

  useEffect(() => {
    function handleCalendarToast(
      event: Event,
    ) {
      const customEvent = event as CustomEvent<ToastPayload>;
      if (!customEvent.detail?.message || !customEvent.detail?.variant) return;
      setToast(customEvent.detail);
    }

    window.addEventListener(GOOGLE_CALENDAR_TOAST_EVENT, handleCalendarToast);
    return () => window.removeEventListener(GOOGLE_CALENDAR_TOAST_EVENT, handleCalendarToast);
  }, []);

  useEffect(() => {
    function handleOpenFeedback(event: Event) {
      const customEvent = event as CustomEvent<{ area?: "command_center" | "profile" | "community" | "calendar" | "lookup" | "other" }>;
      setFeedbackArea(customEvent.detail?.area ?? "other");
      setFeedbackOpen(true);
    }
    window.addEventListener("hub:open-feedback", handleOpenFeedback as EventListener);
    return () => window.removeEventListener("hub:open-feedback", handleOpenFeedback as EventListener);
  }, []);

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

      const buildResult = buildGoogleCalendarEvents({
        classes: request.classes,
        commitments: request.commitments,
        courseLabels: request.courseLabels,
        scheduleTitle: request.scheduleTitle,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles",
        includeExamTimes: request.includeExamTimes,
      });
      const { events, skippedExamCount } = buildResult;

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
      const examNote =
        request.includeExamTimes && skippedExamCount > 0
          ? ` ${skippedExamCount} exam time${skippedExamCount === 1 ? " was" : "s were"} skipped because the date could not be parsed.`
          : "";
      if (failed > 0) {
        setToast({
          variant: "error",
          message: `Added ${result.count} events, but ${failed} item${failed === 1 ? "" : "s"} failed.${examNote}`,
        });
      } else {
        setToast({
          variant: "success",
          message: `Added ${result.count} Google Calendar event${result.count === 1 ? "" : "s"}.${examNote}`,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setToast({
        variant: "error",
        message: `Google Calendar sync error: ${msg}`,
      });
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
        <FeedbackModal
          open={feedbackOpen}
          onClose={() => setFeedbackOpen(false)}
          initialProductArea={feedbackArea}
        />
        <HubToast toast={toast} onDismiss={() => setToast(null)} />
      </CalendarSyncProvider>
    </CalendarStateProvider>
  );
}
