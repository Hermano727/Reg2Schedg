import { redirect } from "next/navigation";
import { ProfileSettingsHub } from "@/components/profile/ProfileSettingsHub";
import { formatUpdatedAt } from "@/lib/hub/format-updated";
import { createClient } from "@/lib/supabase/server";
import type { VaultItem } from "@/types/dossier";
import type { SavedPlanRow } from "@/types/saved-plan";
import type { PostSummary } from "@/types/community";
import type { ProfileData } from "@/components/profile/ProfileEditCard";

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

function buildQuarterRollup(
  plans: Pick<SavedPlanRow, "id" | "quarter_label">[],
) {
  const map = new Map<string, { label: string; planCount: number }>();
  for (const p of plans) {
    const label = p.quarter_label?.trim() || "Unassigned quarter";
    const cur = map.get(label);
    if (cur) cur.planCount += 1;
    else map.set(label, { label, planCount: 1 });
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/profile");
  }

  const [
    { data: profile },
    { data: plansRaw },
    { data: vaultRaw },
    { data: rawUserPosts },
    { data: quotaData },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "display_name, college, expected_grad_term, avatar_url, major, career_path, skill_preference, biggest_concerns, transit_mode, living_situation, commute_minutes, external_commitment_hours, skip_upload_confirmation, show_submission_quota_in_header",
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("saved_plans")
      .select("id, title, quarter_label, status, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("vault_items")
      .select("id, name, kind, mime_type, size_bytes, updated_at, storage_path, community_post_id, community_reply_id, community_post_title, community_reply_preview")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("community_posts_with_author")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
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

  const plans =
    (plansRaw as Pick<
      SavedPlanRow,
      "id" | "title" | "quarter_label" | "status" | "updated_at"
    >[]) ?? [];

  // Signed URL for avatar
  let avatarSignedUrl: string | null = null;
  const rawAvatarUrl = (profile as { avatar_url?: string | null } | null)?.avatar_url;
  if (rawAvatarUrl) {
    const { data: signed } = await supabase.storage
      .from("user-content")
      .createSignedUrl(rawAvatarUrl, 60 * 60 * 24 * 365);
    avatarSignedUrl = signed?.signedUrl ?? null;
  }

  const vaultFromDb =
    (vaultRaw as {
      id: string;
      name: string;
      kind: VaultItem["kind"];
      mime_type: string | null;
      size_bytes: number | null;
      updated_at: string;
      storage_path: string;
      community_post_id: string | null;
      community_reply_id: string | null;
      community_post_title: string | null;
      community_reply_preview: string | null;
    }[] | null) ?? [];

  const vaultItems: VaultItem[] = await Promise.all(
    vaultFromDb.map(async (row) => {
      let signedUrl: string | undefined;
      if (row.storage_path) {
        const { data } = await supabase.storage
          .from("user-content")
          .createSignedUrl(row.storage_path, 3600);
        signedUrl = data?.signedUrl ?? undefined;
      }
      return {
        id: row.id,
        name: row.name,
        kind: row.kind,
        mimeType: row.mime_type ?? null,
        sizeBytes: row.size_bytes ?? null,
        updatedAt: formatUpdatedAt(row.updated_at),
        updatedAtFull: new Date(row.updated_at).toLocaleString(),
        signedUrl,
        communityPostId: row.community_post_id ?? null,
        communityReplyId: row.community_reply_id ?? null,
        communityPostTitle: row.community_post_title ?? null,
        communityReplyPreview: row.community_reply_preview ?? null,
      };
    }),
  );

  const userPosts: PostSummary[] = (rawUserPosts ?? []).map((row) => ({
    id: row.id as string,
    userId: row.user_id as string,
    title: row.title as string,
    body: row.body as string,
    courseCode: (row.course_code as string | null) ?? null,
    professorName: (row.professor_name as string | null) ?? null,
    isAnonymous: (row.is_anonymous as boolean) ?? false,
    generalTags: (row.general_tags as string[]) ?? [],
    authorDisplayName: (row.author_display_name as string) ?? "Anonymous",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    replyCount: (row.reply_count as number) ?? 0,
    upvoteCount: (row.upvote_count as number) ?? 0,
    downvoteCount: (row.downvote_count as number) ?? 0,
    userHasUpvoted: (row.user_has_upvoted as boolean) ?? false,
    userHasDownvoted: (row.user_has_downvoted as boolean) ?? false,
  }));

  const profileData: ProfileData | null = profile
    ? {
        major: (profile as { major?: string | null }).major ?? null,
        career_path: (profile as { career_path?: string | null }).career_path ?? null,
        skill_preference: (profile as { skill_preference?: string | null }).skill_preference ?? null,
        biggest_concerns: (profile as { biggest_concerns?: string[] | null }).biggest_concerns ?? null,
        transit_mode: (profile as { transit_mode?: string | null }).transit_mode ?? null,
        living_situation: (profile as { living_situation?: string | null }).living_situation ?? null,
        commute_minutes: (profile as { commute_minutes?: number | null }).commute_minutes ?? null,
        external_commitment_hours: (profile as { external_commitment_hours?: number | null }).external_commitment_hours ?? null,
      }
    : null;

  const displayName =
    profile?.display_name?.trim() ||
    user.email?.split("@")[0] ||
    "User";
  const email = user.email ?? "";
  const quarters = buildQuarterRollup(plans);

  return (
    <ProfileSettingsHub
      userId={user.id}
      displayName={displayName}
      email={email}
      college={(profile as { college?: string | null } | null)?.college ?? null}
      expectedGrad={(profile as { expected_grad_term?: string | null } | null)?.expected_grad_term ?? null}
      avatarUrl={avatarSignedUrl}
      plans={plans}
      quarters={quarters}
      vaultItems={vaultItems}
      userPosts={userPosts}
      profileData={profileData}
      skipUploadConfirmation={(profile as { skip_upload_confirmation?: boolean } | null)?.skip_upload_confirmation ?? false}
      showSubmissionQuotaInHeader={(profile as { show_submission_quota_in_header?: boolean } | null)?.show_submission_quota_in_header ?? true}
      submissionCountRemaining={submissionCountRemaining}
      submissionResetAtLabel={submissionResetAtLabel}
    />
  );
}
