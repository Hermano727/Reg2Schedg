import { getApiBaseUrl } from "@/lib/api/client";
import type { GoogleCalendarEvent } from "@/lib/mappers/googleCalendar";

export class GoogleCalendarAuthorizationError extends Error {}

type CalendarSyncResponse = {
  count: number;
  failed?: number;
  results?: Array<{ id?: string; status?: string; error?: string }>;
};

const OAUTH_MESSAGE_TYPE = "reg2schedg-google-calendar-oauth";
export const GOOGLE_CALENDAR_TOAST_EVENT = "reg2schedg-google-calendar-toast";

type GoogleCalendarToastDetail = {
  message: string;
  variant: "success" | "error";
};

function dispatchGoogleCalendarToast(detail: GoogleCalendarToastDetail) {
  window.dispatchEvent(
    new CustomEvent<GoogleCalendarToastDetail>(GOOGLE_CALENDAR_TOAST_EVENT, {
      detail,
    }),
  );
}

function getPopupFeatures(): string {
  const width = 560;
  const height = 720;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));

  return [
    "popup=yes",
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    "resizable=yes",
    "scrollbars=yes",
  ].join(",");
}

async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const payload = (await res.json()) as { detail?: string };
    if (payload.detail) return payload.detail;
  } catch {
    // Ignore JSON parse errors and fall back to plain text.
  }

  const text = await res.text().catch(() => "");
  return text || fallback;
}

async function fetchAuthorizeUrl(accessToken: string): Promise<string> {
  const res = await fetch(`${getApiBaseUrl()}/api/calendar/authorize`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(await readApiError(res, `Authorization failed (status ${res.status})`));
  }

  const payload = (await res.json()) as { url: string };
  return payload.url;
}

function waitForOAuthPopup(popup: Window): Promise<void> {
  const apiOrigin = new URL(getApiBaseUrl()).origin;

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Google Calendar authorization timed out."));
    }, 5 * 60 * 1000);

    const closePoll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("Google Calendar authorization was closed before it completed."));
    }, 400);

    function cleanup() {
      window.clearTimeout(timeoutId);
      window.clearInterval(closePoll);
      window.removeEventListener("message", onMessage);
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== apiOrigin) return;
      if (!event.data || typeof event.data !== "object") return;
      if ((event.data as { type?: string }).type !== OAUTH_MESSAGE_TYPE) return;

      const payload = event.data as { status?: string; message?: string };
      cleanup();

      if (payload.status === "success") {
        dispatchGoogleCalendarToast({
          variant: "success",
          message: payload.message || "Google Calendar connected.",
        });
        resolve();
        return;
      }

      dispatchGoogleCalendarToast({
        variant: "error",
        message: payload.message || "Google Calendar authorization failed.",
      });
      reject(new Error(payload.message || "Google Calendar authorization failed."));
    }

    window.addEventListener("message", onMessage);
  });
}

export async function authorizeGoogleCalendar(accessToken: string): Promise<void> {
  const popup = window.open("", "reg2schedg-google-calendar", getPopupFeatures());

  if (!popup) {
    throw new Error("Popup blocked. Please allow popups for Reg2Schedg and try again.");
  }

  popup.document.title = "Reg2Schedg Calendar Sync";
  popup.document.body.innerHTML =
    "<div style=\"font-family: Arial, sans-serif; padding: 32px; color: #0a192f;\">Connecting to Google Calendar...</div>";

  try {
    const url = await fetchAuthorizeUrl(accessToken);
    popup.location.href = url;
    await waitForOAuthPopup(popup);
  } catch (error) {
    if (!popup.closed) popup.close();
    throw error;
  }
}

export async function syncGoogleCalendarEvents(
  accessToken: string,
  events: GoogleCalendarEvent[],
): Promise<CalendarSyncResponse> {
  const res = await fetch(`${getApiBaseUrl()}/api/calendar/sync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(events),
  });

  if (res.status === 401) {
    throw new GoogleCalendarAuthorizationError(
      await readApiError(res, "Google Calendar authorization is required."),
    );
  }

  if (!res.ok) {
    throw new Error(await readApiError(res, `Calendar sync failed (status ${res.status})`));
  }

  return (await res.json()) as CalendarSyncResponse;
}
