import { createClient } from "@/lib/supabase/client";
import { getApiBaseUrl } from "@/lib/api/client";

export type FeedbackReportType = "bug" | "feature" | "ux" | "general";
export type FeedbackProductArea =
  | "command_center"
  | "profile"
  | "community"
  | "calendar"
  | "lookup"
  | "other";

export type SubmitFeedbackPayload = {
  reportType: FeedbackReportType;
  productArea: FeedbackProductArea;
  title: string;
  description: string;
  expectedBehavior?: string | null;
  pagePath?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
};

export type FeedbackSubmission = {
  id: string;
  createdAt: string;
};

async function getAccessToken(): Promise<string> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  return session.access_token;
}

async function readApiErrorMessage(res: Response, fallback: string): Promise<string> {
  const detail = await res.json().catch(() => null);
  const payload = detail?.detail ?? detail;
  if (typeof payload === "string") return payload;
  if (payload && typeof payload === "object") {
    if (typeof payload.message === "string") return payload.message;
    if (typeof payload.detail === "string") return payload.detail;
  }
  return fallback;
}

export async function submitFeedback(payload: SubmitFeedbackPayload): Promise<FeedbackSubmission> {
  const token = await getAccessToken();
  const res = await fetch(`${getApiBaseUrl()}/api/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res, `submitFeedback failed: ${res.status}`));
  }
  return res.json() as Promise<FeedbackSubmission>;
}
