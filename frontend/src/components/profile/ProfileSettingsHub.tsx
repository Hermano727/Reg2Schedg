"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  Check,
  ClipboardList,
  FileText,
  FolderArchive,
  GraduationCap,
  Link2,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Plus,
  ChevronRight,
  Send,
  Settings2,
  Shield,
  Trash2,
  User,
  X,
} from "lucide-react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { ProfileEditCard } from "@/components/profile/ProfileEditCard";
import { AvatarCropModal } from "@/components/profile/AvatarCropModal";
import { VaultUploadModal } from "@/components/profile/VaultUploadModal";
import { vaultKindLabel } from "@/lib/hub/vault-map";
import { uploadFile } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { deletePost, getPost } from "@/lib/api/community";
import {
  submitFeedback,
  type FeedbackProductArea,
  type FeedbackReportType,
} from "@/lib/api/feedback";
import Link from "next/link";
import type { VaultItem } from "@/types/dossier";
import type { PostSummary, ReplyOut } from "@/types/community";
import type { ProfileData } from "@/components/profile/ProfileEditCard";

export type ProfilePlan = {
  id: string;
  title: string;
  quarter_label: string;
  status: string;
  updated_at: string;
};

export type ProfileQuarter = {
  label: string;
  planCount: number;
};

type Section = "profile" | "settings" | "plans" | "vault" | "posts" | "privacy" | "feedback";

const NAV_ITEMS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "settings", label: "Settings", icon: Settings2 },
  { id: "plans", label: "Saved Plans", icon: ClipboardList },
  { id: "vault", label: "Resource Vault", icon: FolderArchive },
  { id: "posts", label: "My Posts", icon: MessageSquare },
  { id: "privacy", label: "Privacy", icon: Shield },
  { id: "feedback", label: "Submit Feedback", icon: Send },
];

const FEEDBACK_REPORT_TYPES: { value: FeedbackReportType; label: string; description: string }[] = [
  { value: "bug", label: "Bug report", description: "Something broke or behaved incorrectly." },
  { value: "feature", label: "Feature request", description: "A capability you want us to add." },
  { value: "ux", label: "UX issue", description: "The flow is confusing or harder than it should be." },
  { value: "general", label: "General feedback", description: "Ideas, praise, or anything else." },
];

const FEEDBACK_PRODUCT_AREAS: { value: FeedbackProductArea; label: string }[] = [
  { value: "command_center", label: "Command Center / Home" },
  { value: "profile", label: "Profile" },
  { value: "community", label: "Community" },
  { value: "calendar", label: "Calendar Sync" },
  { value: "lookup", label: "Class Lookup" },
  { value: "other", label: "Other" },
];

type Props = {
  userId: string;
  displayName: string;
  email: string;
  college: string | null;
  expectedGrad: string | null;
  avatarUrl: string | null;
  plans: ProfilePlan[];
  quarters: ProfileQuarter[];
  vaultItems: VaultItem[];
  userPosts?: PostSummary[];
  profileData: ProfileData | null;
  linkedEmails?: string[];
  skipUploadConfirmation: boolean;
  showSubmissionQuotaInHeader: boolean;
  submissionCountRemaining: number;
  submissionResetAtLabel: string;
};

// ---------------------------------------------------------------------------
// Avatar section (reusable within ProfileSection)
// ---------------------------------------------------------------------------

function AvatarButton({
  userId,
  displayName,
  avatarUrl,
}: {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(avatarUrl);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropFile(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleCropConfirm(blob: Blob) {
    setCropFile(null);
    setUploading(true);
    try {
      const path = `${userId}/avatar/profile.jpg`;
      const storagePath = await uploadFile(path, blob, { maxBytes: 5 * 1_000_000 });
      const supabase = createClient();
      await supabase.from("profiles").update({ avatar_url: storagePath }).eq("id", userId);
      setLocalUrl(URL.createObjectURL(blob));
      router.refresh();
    } catch (err) {
      console.error("Avatar upload failed:", err);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-label="Change profile picture"
        className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/[0.12] bg-hub-surface transition disabled:opacity-60"
      >
        {localUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={localUrl} alt="Profile" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-[family-name:var(--font-jetbrains-mono)] text-lg font-bold text-hub-gold">
            {initials}
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50 opacity-0 transition group-hover:opacity-100">
          {uploading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <Camera className="h-4 w-4 text-white" />
          )}
        </span>
      </button>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleChange} className="hidden" />
      {cropFile && (
        <AvatarCropModal
          file={cropFile}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropFile(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Linked emails section
// ---------------------------------------------------------------------------

function LinkedEmailsSection({ userId, primaryEmail }: { userId: string; primaryEmail: string }) {
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleLink() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.endsWith("@ucsd.edu")) {
      setErrorMsg("Only @ucsd.edu addresses can be linked for WebReg schedule verification.");
      setStatus("error");
      return;
    }
    setStatus("sending");
    setErrorMsg("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/link-callback?userId=${userId}`,
        },
      });
      if (error) throw error;
      setStatus("sent");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to send verification email.");
      setStatus("error");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-hub-text-muted">
          Email addresses
        </p>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-xs text-hub-cyan transition hover:text-hub-cyan/80"
          >
            <Link2 className="h-3 w-3" />
            Link email
          </button>
        )}
      </div>

      <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-2.5">
        <p className="text-sm text-hub-text">{primaryEmail}</p>
        <p className="mt-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] uppercase tracking-wide text-hub-text-muted">
          Primary
        </p>
      </div>

      <AnimatePresence>
        {adding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
              <p className="text-xs text-hub-text-secondary">
                Link your <span className="text-hub-cyan">@ucsd.edu</span> email to unlock WebReg schedule upload.
                We&apos;ll send a verification link to that address.
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="yourname@ucsd.edu"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setStatus("idle");
                    setErrorMsg("");
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 py-2 text-sm text-hub-text placeholder:text-hub-text-muted outline-none focus:border-hub-cyan/40 focus:ring-1 focus:ring-hub-cyan/20 transition"
                />
                <button
                  type="button"
                  onClick={handleLink}
                  disabled={status === "sending" || status === "sent"}
                  className="shrink-0 rounded-lg bg-hub-cyan/15 px-3 py-2 text-xs font-semibold text-hub-cyan ring-1 ring-hub-cyan/35 transition hover:bg-hub-cyan/25 disabled:opacity-50"
                >
                  {status === "sending" ? "Sending…" : status === "sent" ? "Sent!" : "Send link"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setEmail("");
                    setStatus("idle");
                    setErrorMsg("");
                  }}
                  className="shrink-0 rounded-lg border border-white/[0.08] p-2 text-hub-text-muted transition hover:text-hub-text"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {status === "sent" && (
                <p className="flex items-center gap-1.5 text-xs text-hub-success">
                  <Check className="h-3 w-3" /> Check your UCSD inbox for the verification link.
                </p>
              )}
              {status === "error" && (
                <p className="text-xs text-hub-danger">{errorMsg}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle row for settings
// ---------------------------------------------------------------------------

function ToggleRow({ id, label, description }: { id: string; label: string; description: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] py-4 last:border-0 last:pb-0">
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium text-hub-text">
          {label}
        </label>
        <p className="mt-0.5 text-xs text-hub-text-muted">{description}</p>
      </div>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked="false"
        disabled
        className="relative h-6 w-11 shrink-0 rounded-full bg-white/[0.08] ring-1 ring-white/[0.1] transition before:absolute before:left-1 before:top-1 before:h-4 before:w-4 before:rounded-full before:bg-hub-text-muted/50 before:transition before:content-[''] disabled:opacity-50"
        title="Coming soon"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Profile
// ---------------------------------------------------------------------------

function ProfileSection({
  userId,
  displayName,
  email,
  college,
  expectedGrad,
  avatarUrl,
  profileData,
  submissionCountRemaining,
  submissionResetAtLabel,
}: Pick<Props, "userId" | "displayName" | "email" | "college" | "expectedGrad" | "avatarUrl" | "profileData" | "submissionCountRemaining" | "submissionResetAtLabel">) {
  const submissionLabel = submissionCountRemaining === 1 ? "submission" : "submissions";

  return (
    <div className="space-y-8">
      {/* Header card */}
      <div className="flex items-start gap-5">
        <AvatarButton userId={userId} displayName={displayName} avatarUrl={avatarUrl} />
        <div className="min-w-0 flex-1">
          <h1 className="font-[family-name:var(--font-outfit)] text-xl font-semibold text-hub-text">
            {displayName}
          </h1>
          <p className="mt-0.5 font-[family-name:var(--font-jetbrains-mono)] text-xs text-hub-text-muted">
            {email}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {college && (
              <span className="rounded-md border border-white/[0.1] bg-white/[0.04] px-2 py-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] uppercase tracking-wide text-hub-text-secondary">
                {college}
              </span>
            )}
            {expectedGrad && (
              <span className="rounded-md border border-hub-cyan/25 bg-hub-cyan/10 px-2 py-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] uppercase tracking-wide text-hub-cyan">
                Grad · {expectedGrad}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 space-y-2">
          <SignOutButton variant="danger" className="w-full" />
          <div className="rounded-lg border border-white/[0.10] bg-white/[0.03] px-3 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-hub-text-muted">
              Submission quota
            </p>
            <p className="mt-1 text-sm font-medium text-hub-text">
              {submissionCountRemaining} {submissionLabel} left
            </p>
            <p className="mt-0.5 text-xs text-hub-text-muted">
              Resets at {submissionResetAtLabel}
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-white/[0.06]" />

      {/* Linked emails */}
      <LinkedEmailsSection userId={userId} primaryEmail={email} />

      <div className="border-t border-white/[0.06]" />

      {/* Academic profile */}
      <div>
        <div className="mb-5 flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-hub-cyan" />
          <h2 className="font-[family-name:var(--font-outfit)] text-sm font-semibold uppercase tracking-[0.12em] text-hub-text">
            Academic Profile
          </h2>
        </div>
        <p className="mb-5 text-sm text-hub-text-secondary">
          Your major, career goals, and academic goals used to personalize every schedule analysis.
        </p>
        {profileData ? (
          <ProfileEditCard userId={userId} initial={profileData} />
        ) : (
          <p className="text-sm text-hub-text-muted">Sign in to edit your academic profile.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Settings
// ---------------------------------------------------------------------------

function SettingsSection({
  skipUploadConfirmation,
  showSubmissionQuotaInHeader,
  savingPreference,
  onPreferenceChange,
}: {
  skipUploadConfirmation: boolean;
  showSubmissionQuotaInHeader: boolean;
  savingPreference: boolean;
  onPreferenceChange: (patch: { skipUploadConfirmation?: boolean; showSubmissionQuotaInHeader?: boolean }) => void;
}) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-[family-name:var(--font-outfit)] text-sm font-semibold uppercase tracking-[0.12em] text-hub-text">
          Upload preferences
        </h2>
        <p className="mt-1 text-sm text-hub-text-muted">
          Control confirmation behavior and quota visibility in the header.
        </p>
        <div className="mt-4 space-y-3">
          <label className="flex items-start justify-between gap-4 rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-hub-text">Skip upload confirmation modal</p>
              <p className="mt-0.5 text-xs text-hub-text-muted">
                When enabled, schedule files submit immediately without the final confirmation prompt.
              </p>
            </div>
            <input
              type="checkbox"
              checked={skipUploadConfirmation}
              disabled={savingPreference}
              onChange={(e) => onPreferenceChange({ skipUploadConfirmation: e.target.checked })}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/[0.25] bg-transparent text-hub-cyan focus:ring-hub-cyan/50 disabled:opacity-60"
            />
          </label>

          <label className="flex items-start justify-between gap-4 rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-hub-text">Show submissions left in header</p>
              <p className="mt-0.5 text-xs text-hub-text-muted">
                Displays the remaining submission count and reset time in the top navigation bar.
              </p>
            </div>
            <input
              type="checkbox"
              checked={showSubmissionQuotaInHeader}
              disabled={savingPreference}
              onChange={(e) => onPreferenceChange({ showSubmissionQuotaInHeader: e.target.checked })}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/[0.25] bg-transparent text-hub-cyan focus:ring-hub-cyan/50 disabled:opacity-60"
            />
          </label>
        </div>
      </div>

      <div className="border-t border-white/[0.06]" />

      <div>
        <h2 className="font-[family-name:var(--font-outfit)] text-sm font-semibold uppercase tracking-[0.12em] text-hub-text">
          Notifications
        </h2>
        <p className="mt-1 text-sm text-hub-text-muted">Email and in-app alerts.</p>
        <div className="mt-4">
          <ToggleRow
            id="notify-ingest"
            label="Ingestion finished"
            description="When a schedule or syllabus run completes or fails."
          />
          <ToggleRow
            id="notify-calendar"
            label="Calendar conflicts"
            description="When synced events overlap or drift from WebReg."
          />
        </div>
      </div>

      <div className="border-t border-white/[0.06]" />

      <div>
        <h2 className="font-[family-name:var(--font-outfit)] text-sm font-semibold uppercase tracking-[0.12em] text-hub-text">
          Appearance
        </h2>
        <p className="mt-1 text-sm text-hub-text-muted">
          Theme is fixed to command-deck dark for the initial release. Light mode is not planned.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Saved Plans
// ---------------------------------------------------------------------------

function PlansSection({ plans, quarters }: Pick<Props, "plans" | "quarters">) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-4 font-[family-name:var(--font-outfit)] text-sm font-semibold uppercase tracking-[0.12em] text-hub-text">
          Quarters
        </h2>
        <ul className="space-y-2">
          {quarters.length === 0 ? (
            <li className="rounded-xl border border-dashed border-white/[0.12] bg-hub-bg/30 px-4 py-8 text-center">
              <p className="text-sm text-hub-text-muted">
                No quarters yet. Upload a schedule on the home page while signed in.
              </p>
            </li>
          ) : (
            quarters.map((q) => (
              <li key={q.label}>
                <Link
                  href="/"
                  className="group flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-hub-surface/60 px-4 py-3 transition hover:border-hub-cyan/30 hover:bg-hub-surface-elevated/80"
                >
                  <div>
                    <p className="text-sm font-medium text-hub-text group-hover:text-hub-cyan">{q.label}</p>
                    <p className="mt-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] uppercase tracking-wide text-hub-text-muted">
                      {q.planCount} plan{q.planCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-hub-gold opacity-0 transition group-hover:opacity-100">
                    →
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="border-t border-white/[0.06]" />

      <div>
        <h2 className="mb-4 font-[family-name:var(--font-outfit)] text-sm font-semibold uppercase tracking-[0.12em] text-hub-text">
          All Plans
        </h2>
        <ul className="space-y-2">
          {plans.length === 0 ? (
            <li className="text-sm text-hub-text-muted">No saved plans.</li>
          ) : (
            plans.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/?planId=${p.id}`}
                  className="flex flex-col rounded-lg border border-white/[0.06] bg-hub-bg/35 px-4 py-3 transition hover:border-white/[0.14]"
                >
                  <span className="text-sm font-medium text-hub-text">{p.title || "Untitled plan"}</span>
                  <span className="mt-1 font-[family-name:var(--font-jetbrains-mono)] text-[10px] uppercase tracking-wide text-hub-text-muted">
                    {p.quarter_label || "—"} · {p.status} ·{" "}
                    {new Date(p.updated_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Resource Vault
// ---------------------------------------------------------------------------

function VaultSection({ userId, vaultItems }: Pick<Props, "userId" | "vaultItems">) {
  const router = useRouter();
  const [vaultModalOpen, setVaultModalOpen] = useState(false);
  const [menuItemId, setMenuItemId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const closeMenuTimerRef = useRef<number | null>(null);
  const [postMetaByItemId, setPostMetaByItemId] = useState<Record<string, {
    courseCode?: string | null;
    professorName?: string | null;
    replyAuthor?: string | null;
    replyBody?: string | null;
  }>>({});

  function clearCloseMenuTimer() {
    if (closeMenuTimerRef.current !== null) {
      window.clearTimeout(closeMenuTimerRef.current);
      closeMenuTimerRef.current = null;
    }
  }

  function scheduleCloseMenu(itemId: string) {
    clearCloseMenuTimer();
    closeMenuTimerRef.current = window.setTimeout(() => {
      setMenuItemId((prev) => (prev === itemId ? null : prev));
      closeMenuTimerRef.current = null;
    }, 180);
  }

  async function handleDeleteVaultItem(itemId: string) {
    if (deletingItemId) return;
    setDeletingItemId(itemId);
    try {
      const supabase = createClient();
      await supabase
        .from("vault_items")
        .delete()
        .eq("id", itemId)
        .eq("user_id", userId);
      setMenuItemId(null);
      router.refresh();
    } finally {
      setDeletingItemId(null);
    }
  }

  useEffect(() => {
    const communityItems = vaultItems.filter((i) => i.kind === "community" && i.communityPostId);
    if (communityItems.length === 0) return;

    communityItems.forEach((item) => {
      if (postMetaByItemId[item.id]) return;
      (async () => {
        try {
          const post = await getPost(item.communityPostId!);
          const meta: {
            courseCode: string | null;
            professorName: string | null;
            replyAuthor?: string | null;
            replyBody?: string | null;
          } = {
            courseCode: post.courseCode ?? null,
            professorName: post.professorName ?? null,
          };
          if (item.communityReplyId) {
            const reply = post.replies?.find((r: ReplyOut) => r.id === item.communityReplyId);
            meta.replyAuthor = reply?.authorDisplayName ?? null;
            meta.replyBody = reply?.body ?? null;
          }
          setPostMetaByItemId((s) => ({ ...s, [item.id]: meta }));
        } catch {
          // non-fatal
        }
      })();
    });
  }, [vaultItems, postMetaByItemId]);

  return (
    <div className="space-y-5">
    <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div>
          <h2 className="font-[family-name:var(--font-outfit)] text-sm font-semibold uppercase tracking-[0.12em] text-hub-text">
            Resource Vault
          </h2>
          <p className="mt-1 text-xs text-hub-text-muted">
            Private uploads: syllabi, WebReg exports, and notes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setVaultModalOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-hub-cyan/30 bg-hub-cyan/10 px-3 text-xs font-medium text-hub-cyan transition hover:bg-hub-cyan/20"
        >
          <Plus className="h-3.5 w-3.5" />
          Upload
        </button>
      </div>

      <VaultUploadModal
        userId={userId}
        open={vaultModalOpen}
        onOpenChange={setVaultModalOpen}
        onSuccess={() => router.refresh()}
      />

      {vaultItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/[0.12] bg-hub-surface/40 px-4 py-12 text-center">
          <FileText className="mx-auto h-8 w-8 text-hub-text-muted" aria-hidden />
          <p className="mt-3 text-sm text-hub-text-muted">Vault is empty.</p>
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.2]">
          {vaultItems.map((item) =>
            item.kind === "community" && item.communityPostId ? (
              <li key={item.id} className="py-8 first:pt-0">
                {/* Header: title left, date + menu right */}
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="font-[family-name:var(--font-outfit)] text-base font-bold leading-snug text-hub-text">
                      {item.communityPostTitle ?? "Community post"}
                    </h3>
                    {(postMetaByItemId[item.id]?.courseCode || postMetaByItemId[item.id]?.professorName) && (
                      <p className="mt-1.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.14em] text-hub-cyan/70">
                        {`${postMetaByItemId[item.id]?.courseCode ?? ""} ${postMetaByItemId[item.id]?.professorName ?? ""}`.trim()}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-[family-name:var(--font-jetbrains-mono)] text-[11px] text-hub-text-muted">
                      {item.updatedAtFull ?? item.updatedAt}
                    </span>
                    <div
                      className="relative"
                      onMouseEnter={clearCloseMenuTimer}
                      onMouseLeave={() => scheduleCloseMenu(item.id)}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          clearCloseMenuTimer();
                          setMenuItemId((prev) => (prev === item.id ? null : item.id));
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-hub-text-muted transition hover:text-hub-text"
                        aria-label="Open vault item options"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {menuItemId === item.id && (
                        <div
                          className="absolute right-0 top-8 z-20 min-w-[150px] rounded-md border border-white/[0.08] bg-hub-surface-elevated p-1 shadow-xl"
                          onMouseEnter={clearCloseMenuTimer}
                          onMouseLeave={() => scheduleCloseMenu(item.id)}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              clearCloseMenuTimer();
                              void handleDeleteVaultItem(item.id);
                            }}
                            disabled={deletingItemId === item.id}
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-hub-danger transition hover:bg-hub-danger/10 disabled:opacity-60"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {deletingItemId === item.id ? "Deleting..." : "Delete from vault"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Image */}
                {item.signedUrl && item.mimeType?.startsWith("image/") && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.signedUrl}
                    alt={item.name}
                    className="mt-5 w-full rounded-lg object-cover"
                  />
                )}

                {/* Reply quote */}
                {(postMetaByItemId[item.id]?.replyBody ?? item.communityReplyPreview) && (
                  <p className="mt-5 border-l-2 border-hub-cyan/30 pl-4 font-[family-name:var(--font-ibm-plex-sans)] text-sm italic leading-relaxed text-hub-text-secondary">
                    &ldquo;{postMetaByItemId[item.id]?.replyBody ?? item.communityReplyPreview}&rdquo;
                  </p>
                )}

                {/* Footer: commenter left, go to post right */}
                <div className="mt-5 flex items-center justify-between">
                  <div>
                    {postMetaByItemId[item.id]?.replyAuthor ? (
                      <p className="font-[family-name:var(--font-jetbrains-mono)] text-[11px] uppercase tracking-wider text-hub-text-muted">
                        {postMetaByItemId[item.id]?.replyAuthor}
                      </p>
                    ) : (
                      <span />
                    )}
                  </div>
                  <Link
                    href={`/community/${item.communityPostId}${item.communityReplyId ? `#reply-${item.communityReplyId}` : ""}`}
                    className="inline-flex items-center gap-1 font-[family-name:var(--font-outfit)] text-sm font-semibold text-hub-cyan transition hover:text-hub-cyan/75"
                  >
                    Go to post <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </li>
            ) : item.signedUrl ? (
              <li key={item.id} className="py-3 first:pt-0">
                <a
                  href={item.signedUrl}
                  download={item.name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-start gap-3 rounded-xl border border-white/[0.08] bg-hub-surface/50 p-4 text-left transition hover:border-hub-cyan/25 hover:bg-hub-surface-elevated/60"
                >
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-hub-gold" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-hub-text">{item.name}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] uppercase tracking-wide text-hub-text-muted">
                      <span>{vaultKindLabel(item.kind)}</span>
                      <span aria-hidden>·</span>
                      <span>{item.updatedAt}</span>
                      <span aria-hidden>·</span>
                      <span className="text-hub-cyan/60">Download</span>
                    </span>
                  </span>
                </a>
              </li>
            ) : (
              <li key={item.id} className="py-3 first:pt-0">
                <div className="flex w-full items-start gap-3 rounded-xl border border-white/[0.08] bg-hub-surface/50 p-4 text-left">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-hub-gold" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-hub-text">{item.name}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] uppercase tracking-wide text-hub-text-muted">
                      <span>{vaultKindLabel(item.kind)}</span>
                      <span aria-hidden>·</span>
                      <span>{item.updatedAt}</span>
                    </span>
                  </span>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: My Posts
// ---------------------------------------------------------------------------

function PostsSection({ userPosts }: { userPosts: PostSummary[] }) {
  const [posts, setPosts] = useState<PostSummary[]>(userPosts);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(postId: string) {
    if (deletingId) return;
    setDeletingId(postId);
    try {
      await deletePost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      setConfirmId(null);
    } catch {
      setConfirmId(null);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-[family-name:var(--font-outfit)] text-sm font-semibold uppercase tracking-[0.12em] text-hub-text">
          My Posts
        </h2>
        <p className="mt-1 text-xs text-hub-text-muted">
          Your community discussions. Deleting a post removes it from the community permanently.
        </p>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/[0.12] bg-hub-bg/30 px-6 py-10 text-center">
          <MessageSquare className="mx-auto h-8 w-8 text-hub-text-muted" />
          <p className="mt-3 text-sm text-hub-text-muted">No posts yet.</p>
          <Link
            href="/community"
            className="mt-2 inline-block text-xs text-hub-cyan underline-offset-2 hover:underline transition"
          >
            Go to Community →
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {posts.map((post) => (
            <li
              key={post.id}
              className="group relative rounded-xl border border-white/[0.08] bg-hub-surface/50 transition hover:border-white/[0.14]"
            >
              <Link href={`/community/${post.id}`} className="block px-4 py-3 pr-20">
                <p className="line-clamp-1 text-sm font-medium text-hub-text">{post.title}</p>
                <p className="mt-0.5 line-clamp-1 text-xs text-hub-text-muted">{post.body}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  {post.courseCode && (
                    <span className="rounded-md bg-hub-cyan/10 px-1.5 py-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] uppercase tracking-wide text-hub-cyan">
                      {post.courseCode}
                    </span>
                  )}
                  <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-hub-text-muted">
                    {post.replyCount} {post.replyCount === 1 ? "reply" : "replies"} ·{" "}
                    {new Date(post.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </Link>

              {/* Delete control */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {confirmId === post.id ? (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-hub-danger/40 bg-hub-bg px-2 py-1">
                    <span className="text-[11px] text-hub-danger">Delete?</span>
                    <button
                      type="button"
                      onClick={() => handleDelete(post.id)}
                      disabled={deletingId === post.id}
                      className="text-[11px] font-semibold text-hub-danger hover:text-hub-danger/80 disabled:opacity-50 transition"
                    >
                      {deletingId === post.id ? "…" : "Yes"}
                    </button>
                    <span className="text-[11px] text-hub-text-muted">/</span>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="text-[11px] text-hub-text-muted hover:text-hub-text transition"
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(post.id)}
                    aria-label="Delete post"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-hub-text-muted opacity-0 group-hover:opacity-100 hover:text-hub-danger transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Privacy
// ---------------------------------------------------------------------------

function PrivacySection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-outfit)] text-sm font-semibold uppercase tracking-[0.12em] text-hub-text">
          Privacy
        </h2>
        <p className="mt-1 text-sm text-hub-text-muted">Controls for your data and account visibility.</p>
      </div>
      <div className="rounded-xl border border-dashed border-white/[0.12] bg-hub-bg/30 px-6 py-10 text-center">
        <Shield className="mx-auto h-8 w-8 text-hub-text-muted" />
        <p className="mt-3 text-sm font-medium text-hub-text">Privacy controls coming soon</p>
        <p className="mt-1 text-xs text-hub-text-muted">
          Data export, account deletion, and visibility settings will appear here.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Feedback
// ---------------------------------------------------------------------------

function FeedbackSection() {
  const [reportType, setReportType] = useState<FeedbackReportType>("bug");
  const [productArea, setProductArea] = useState<FeedbackProductArea>("command_center");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [expectedBehavior, setExpectedBehavior] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const canSubmit = title.trim().length >= 3 && description.trim().length >= 10 && status !== "sending";

  async function handleSubmit() {
    if (!canSubmit) return;
    setStatus("sending");
    setErrorMessage("");

    try {
      await submitFeedback({
        reportType,
        productArea,
        title: title.trim(),
        description: description.trim(),
        expectedBehavior: expectedBehavior.trim() || null,
        pagePath: `${window.location.pathname}${window.location.search}`,
        userAgent: navigator.userAgent,
        metadata: {
          source: "profile_feedback",
          locale: navigator.language ?? null,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
        },
      });

      setStatus("sent");
      setTitle("");
      setDescription("");
      setExpectedBehavior("");
      setReportType("bug");
      setProductArea("command_center");
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to send feedback.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-outfit)] text-sm font-semibold uppercase tracking-[0.12em] text-hub-text">
          Submit Feedback
        </h2>
        <p className="mt-1 text-sm text-hub-text-muted">
          Report a bug, suggest a feature, or share general thoughts.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {status === "sent" ? (
          <motion.div
            key="sent"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-3 rounded-xl border border-hub-success/30 bg-hub-success/10 px-6 py-10 text-center"
          >
            <Check className="h-8 w-8 text-hub-success" />
            <p className="font-medium text-hub-text">Thanks for the feedback!</p>
            <button
              type="button"
              onClick={() => {
                setStatus("idle");
                setErrorMessage("");
              }}
              className="text-xs text-hub-text-muted underline underline-offset-2 transition hover:text-hub-text"
            >
              Submit another
            </button>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-hub-text-muted">
                What are you reporting?
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {FEEDBACK_REPORT_TYPES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => {
                      setReportType(item.value);
                      if (status === "error") {
                        setStatus("idle");
                        setErrorMessage("");
                      }
                    }}
                    className={[
                      "rounded-lg border px-3 py-2 text-left transition",
                      reportType === item.value
                        ? "border-hub-cyan/45 bg-hub-cyan/12 text-hub-text"
                        : "border-white/[0.10] bg-white/[0.03] text-hub-text-secondary hover:border-white/[0.18] hover:text-hub-text",
                    ].join(" ")}
                  >
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="mt-0.5 text-xs text-hub-text-muted">{item.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-hub-text-muted">
                Area
              </span>
              <select
                value={productArea}
                onChange={(e) => {
                  setProductArea(e.target.value as FeedbackProductArea);
                  if (status === "error") {
                    setStatus("idle");
                    setErrorMessage("");
                  }
                }}
                className="w-full rounded-xl border border-white/[0.10] bg-white/[0.03] px-4 py-2.5 text-sm text-hub-text outline-none transition focus:border-hub-cyan/40 focus:ring-1 focus:ring-hub-cyan/20"
              >
                {FEEDBACK_PRODUCT_AREAS.map((item) => (
                  <option key={item.value} value={item.value} className="bg-hub-surface-elevated">
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-hub-text-muted">
                What went wrong?
              </span>
              <input
                type="text"
                maxLength={120}
                placeholder="Short summary (e.g. Upload freezes at 80%)"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (status === "error") {
                    setStatus("idle");
                    setErrorMessage("");
                  }
                }}
                className="w-full rounded-xl border border-white/[0.10] bg-white/[0.03] px-4 py-2.5 text-sm text-hub-text placeholder:text-hub-text-muted outline-none transition focus:border-hub-cyan/40 focus:ring-1 focus:ring-hub-cyan/20"
              />
              <p className="mt-1 text-right font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-hub-text-muted">
                {title.trim().length}/120
              </p>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-hub-text-muted">
                Description
              </span>
              <textarea
                rows={6}
                maxLength={4000}
                placeholder="Open description: what happened, and how can we reproduce it?"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (status === "error") {
                    setStatus("idle");
                    setErrorMessage("");
                  }
                }}
                className="w-full resize-none rounded-xl border border-white/[0.10] bg-white/[0.03] px-4 py-3 text-sm text-hub-text placeholder:text-hub-text-muted outline-none focus:border-hub-cyan/40 focus:ring-1 focus:ring-hub-cyan/20 transition"
              />
              <p className="mt-1 text-right font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-hub-text-muted">
                {description.trim().length}/4000
              </p>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-hub-text-muted">
                What did you expect? (optional)
              </span>
              <textarea
                rows={3}
                maxLength={2000}
                placeholder="Expected result"
                value={expectedBehavior}
                onChange={(e) => {
                  setExpectedBehavior(e.target.value);
                  if (status === "error") {
                    setStatus("idle");
                    setErrorMessage("");
                  }
                }}
                className="w-full resize-none rounded-xl border border-white/[0.10] bg-white/[0.03] px-4 py-3 text-sm text-hub-text placeholder:text-hub-text-muted outline-none transition focus:border-hub-cyan/40 focus:ring-1 focus:ring-hub-cyan/20"
              />
            </label>

            {status === "error" && (
              <div className="rounded-lg border border-hub-danger/30 bg-hub-danger/10 px-3 py-2 text-xs text-hub-danger">
                {errorMessage || "Could not send feedback. Please try again."}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-hub-cyan/15 px-4 text-sm font-semibold text-hub-cyan ring-1 ring-hub-cyan/35 transition hover:bg-hub-cyan/25 disabled:opacity-40"
              >
                {status === "sending" ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-hub-cyan/30 border-t-hub-cyan" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    Send feedback
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProfileSettingsHub(props: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const section = (searchParams.get("section") ?? "profile") as Section;
  const [skipUploadConfirmation, setSkipUploadConfirmation] = useState(props.skipUploadConfirmation);
  const [showSubmissionQuotaInHeader, setShowSubmissionQuotaInHeader] = useState(props.showSubmissionQuotaInHeader);
  const [savingPreference, setSavingPreference] = useState(false);

  function navigate(s: Section) {
    router.push(`/profile?section=${s}`);
  }

  async function handlePreferenceChange(patch: {
    skipUploadConfirmation?: boolean;
    showSubmissionQuotaInHeader?: boolean;
  }) {
    if (savingPreference) return;

    const nextSkip = patch.skipUploadConfirmation ?? skipUploadConfirmation;
    const nextShowQuota = patch.showSubmissionQuotaInHeader ?? showSubmissionQuotaInHeader;
    const previousSkip = skipUploadConfirmation;
    const previousShowQuota = showSubmissionQuotaInHeader;

    setSkipUploadConfirmation(nextSkip);
    setShowSubmissionQuotaInHeader(nextShowQuota);
    setSavingPreference(true);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({
          skip_upload_confirmation: nextSkip,
          show_submission_quota_in_header: nextShowQuota,
        })
        .eq("id", props.userId);
      if (error) throw error;

      window.dispatchEvent(new CustomEvent("hub:profile-preferences-updated", {
        detail: {
          skipUploadConfirmation: nextSkip,
          showSubmissionQuotaInHeader: nextShowQuota,
        },
      }));
    } catch (error) {
      console.error("handlePreferenceChange failed:", error);
      setSkipUploadConfirmation(previousSkip);
      setShowSubmissionQuotaInHeader(previousShowQuota);
    } finally {
      setSavingPreference(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* Left settings nav */}
      <aside className="w-52 shrink-0 py-8 pl-6 pr-3">
        <p className="mb-4 px-3 font-[family-name:var(--font-jetbrains-mono)] text-[14px] font-medium uppercase tracking-[0.2em] text-hub-text-muted">
          Account
        </p>
        <nav className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                className={[
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition",
                  active
                    ? "bg-white/[0.07] text-hub-text"
                    : "text-hub-text-secondary hover:bg-white/[0.04] hover:text-hub-text",
                ].join(" ")}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-6 border-t border-white/[0.06] pt-4 px-3">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs text-hub-text-muted transition hover:text-hub-text"
          >
            <LogOut className="h-3.5 w-3.5 rotate-180" />
            Back to hub
          </Link>
        </div>
      </aside>

      {/* Vertical divider */}
      <div className="w-px shrink-0 bg-white/[0.06]" />

      {/* Content */}
      <main className="min-w-0 flex-1 overflow-y-auto px-10 py-8">
        <div className="mx-auto max-w-2xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              {section === "profile" && (
                <ProfileSection
                  userId={props.userId}
                  displayName={props.displayName}
                  email={props.email}
                  college={props.college}
                  expectedGrad={props.expectedGrad}
                  avatarUrl={props.avatarUrl}
                  profileData={props.profileData}
                  submissionCountRemaining={props.submissionCountRemaining}
                  submissionResetAtLabel={props.submissionResetAtLabel}
                />
              )}
              {section === "settings" && (
                <SettingsSection
                  skipUploadConfirmation={skipUploadConfirmation}
                  showSubmissionQuotaInHeader={showSubmissionQuotaInHeader}
                  savingPreference={savingPreference}
                  onPreferenceChange={(patch) => void handlePreferenceChange(patch)}
                />
              )}
              {section === "plans" && <PlansSection plans={props.plans} quarters={props.quarters} />}
              {section === "vault" && <VaultSection userId={props.userId} vaultItems={props.vaultItems} />}
              {section === "posts" && <PostsSection userPosts={props.userPosts ?? []} />}
              {section === "privacy" && <PrivacySection />}
              {section === "feedback" && <FeedbackSection />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
