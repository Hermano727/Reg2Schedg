import type { ReactNode } from "react";
import { HubShell } from "@/components/layout/HubShell";
import { createClient } from "@/lib/supabase/server";

type SubmissionQuotaStatus = {
  submissionsRemaining: number;
  limit: number;
  windowSeconds: number;
  resetsAt: string | null;
};

function toInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function normalizeQuotaStatus(data: unknown): SubmissionQuotaStatus | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;

  const limit = Math.max(1, toInt(record.limit, 3));
  const windowSeconds = Math.max(1, toInt(record.window_seconds, 6 * 60 * 60));
  const submissionsUsed = Math.max(0, toInt(record.submissions_used, 0));
  const submissionsRemaining = Math.max(0, toInt(record.submissions_remaining, Math.max(0, limit - submissionsUsed)));

  return {
    submissionsRemaining,
    limit,
    windowSeconds,
    resetsAt: typeof record.resets_at === "string" ? record.resets_at : null,
  };
}

function formatQuotaResetTime(resetAtMs: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(resetAtMs));
}

export default async function HubLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let hubUser = null;
  if (user) {
    const [{ data: profile }, { data: quotaData }] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, avatar_url, onboarding_complete, show_submission_quota_in_header")
        .eq("id", user.id)
        .maybeSingle(),
      supabase.rpc("get_schedule_submission_quota_status"),
    ]);

    const quotaStatus = normalizeQuotaStatus(quotaData);
    const nowMs = Date.now();
    const quotaResetAtMsRaw = quotaStatus?.resetsAt ? Date.parse(quotaStatus.resetsAt) : NaN;
    const quotaResetAtMs = Number.isFinite(quotaResetAtMsRaw) ? quotaResetAtMsRaw : null;
    const isQuotaWindowActive = quotaResetAtMs !== null && quotaResetAtMs > nowMs;
    const quotaLimit = Math.max(1, quotaStatus?.limit ?? 3);
    const quotaWindowHours = Math.max(1, Math.ceil((quotaStatus?.windowSeconds ?? 6 * 60 * 60) / 3600));
    const submissionCountRemaining = isQuotaWindowActive
      ? Math.max(0, Math.min(quotaLimit, quotaStatus?.submissionsRemaining ?? quotaLimit))
      : quotaLimit;
    const submissionResetAtLabel = isQuotaWindowActive && quotaResetAtMs !== null
      ? formatQuotaResetTime(quotaResetAtMs)
      : `${quotaWindowHours} hours after your first submission`;
    const showSubmissionQuotaInHeader = (profile as { show_submission_quota_in_header?: boolean } | null)?.show_submission_quota_in_header ?? true;

    const email = user.email ?? "";

    let avatarUrl: string | null = null;
    const rawAvatar = (profile as { avatar_url?: string | null } | null)?.avatar_url;
    if (rawAvatar) {
      const { data: signed } = await supabase.storage
        .from("user-content")
        .createSignedUrl(rawAvatar, 60 * 60 * 24 * 7); // 7-day for header
      avatarUrl = signed?.signedUrl ?? null;
    }

    const onboardingComplete = (profile as { onboarding_complete?: boolean } | null)?.onboarding_complete ?? false;

    hubUser = {
      id: user.id,
      email,
      displayName: profile?.display_name?.trim() || email.split("@")[0] || "User",
      avatarUrl,
      needsOnboarding: !onboardingComplete,
      submissionQuota: {
        submissionsRemaining: submissionCountRemaining,
        resetsAtLabel: submissionResetAtLabel,
        showInHeader: showSubmissionQuotaInHeader,
      },
    };
  }

  return <HubShell user={hubUser}>{children}</HubShell>;
}
