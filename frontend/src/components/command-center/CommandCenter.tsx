"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, AlertTriangle, Check, ChevronRight, Clock, GraduationCap, Images, Search, Trash2, X, XCircle } from "lucide-react";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { IngestionHub } from "@/components/ingestion/IngestionHub";
import { ProcessingModal } from "@/components/modals/ProcessingModal";
import { DossierScheduleWorkspace, type DossierScheduleWorkspaceHandle } from "@/components/dashboard/DossierScheduleWorkspace";
import { HubToast, type ToastPayload } from "@/components/ui/HubToast";
import { IdleWatermark } from "@/components/ui/IdleWatermark";
import { usePlanSync } from "@/hooks/usePlanSync";
import { fetchPublicDemoPlan } from "@/lib/api/plans";
import { createClient } from "@/lib/supabase/client";
import { mockDossier } from "@/lib/mock/dossier";
import { analyzeFit, researchScreenshot, InvalidScheduleError, RateLimitedError } from "@/lib/api/parse";
import { courseResearchResultToDossier } from "@/lib/mappers/courseEntryToDossier";
import { dossiersToScheduleItems } from "@/lib/mappers/dossiersToScheduleItems";
import { getScheduleDifficultyLabel } from "@/lib/hub/scheduleDifficulty";
import type { ClassDossier, ScheduleCommitment, ScheduleEvaluation, UiPhase } from "@/types/dossier";

const FINISH_PAD_MS = 650;
const SCHEDULE_SUBMISSION_LIMIT = 3;
const SCHEDULE_SUBMISSION_WINDOW_MS = 6 * 60 * 60 * 1000;

type SubmissionQuotaStatus = {
  allowed: boolean;
  submissionsUsed: number;
  submissionsRemaining: number;
  limit: number;
  windowSeconds: number;
  windowStartedAt: string | null;
  resetsAt: string | null;
  retryAfterSeconds: number;
};

const DEFAULT_SUBMISSION_QUOTA_STATUS: SubmissionQuotaStatus = {
  allowed: true,
  submissionsUsed: 0,
  submissionsRemaining: SCHEDULE_SUBMISSION_LIMIT,
  limit: SCHEDULE_SUBMISSION_LIMIT,
  windowSeconds: SCHEDULE_SUBMISSION_WINDOW_MS / 1000,
  windowStartedAt: null,
  resetsAt: null,
  retryAfterSeconds: 0,
};

function _toInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function normalizeQuotaStatus(data: unknown): SubmissionQuotaStatus | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;

  const limit = Math.max(1, _toInt(record.limit, SCHEDULE_SUBMISSION_LIMIT));
  const windowSeconds = Math.max(1, _toInt(record.window_seconds, SCHEDULE_SUBMISSION_WINDOW_MS / 1000));
  const submissionsUsed = Math.max(0, _toInt(record.submissions_used, 0));
  const submissionsRemaining = Math.max(0, _toInt(record.submissions_remaining, Math.max(0, limit - submissionsUsed)));

  return {
    allowed: record.allowed !== false,
    submissionsUsed,
    submissionsRemaining,
    limit,
    windowSeconds,
    windowStartedAt: typeof record.window_started_at === "string" ? record.window_started_at : null,
    resetsAt: typeof record.resets_at === "string" ? record.resets_at : null,
    retryAfterSeconds: Math.max(0, _toInt(record.retry_after_seconds, 0)),
  };
}

function formatQuotaResetTime(resetAtMs: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(resetAtMs));
}

const WHAT_YOU_GET = [
  { label: "PROFESSOR RATINGS", detail: "RMP scores + teaching style pulled live for your section" },
  { label: "GRADE DISTRIBUTIONS", detail: "CAPE/SunSET A–F breakdowns for every course" },
  { label: "COMMUNITY DISCUSSIONS", detail: "Reddit r/UCSD threads ranked by relevance" },
  { label: "WORKLOAD SCORE", detail: "A ranked estimate of how survivable your full schedule and workload is" },
  { label: "CUSTOMIZABLE CALENDAR", detail: "Drag-reschedulable weekly view with custom commitments and export to Google Calendar" },
  { label: "MAP VISUALIZATION", detail: "Interactive campus map showing class locations and walking patterns between buildings" },
] as const;

const LANDING_JOURNEY_STEPS = [
  {
    step: "01",
    title: "Attach your schedule",
    detail: "Upload a screenshot or PDF.",
  },
  {
    step: "02",
    title: "Look up a class or professor",
    detail: "Check one class or professor first.",
  },
  {
    step: "03",
    title: "Calendar and summary",
    detail: "See the calendar, ratings, and workload.",
  },
] as const;

type ProfileFitContext = {
  major?: string;
  careerPath?: string;
  skillPreference?: string;
  biggestConcerns?: string[];
  transitMode?: string;
  livingSituation?: string;
  commuteMinutes?: number;
  externalCommitmentHours?: number;
};

const CONCERN_LABELS: Record<string, string> = {
  workload: "heavy workload",
  scheduling: "tight scheduling",
  commute: "long commute",
  gpa: "gpa protection",
  attendance: "attendance requirements",
  heavy_math_load: "heavy math load",
  theoretical_classes: "theoretical classes",
  lab_scheduling: "lab scheduling",
  ochem: "organic chemistry",
  group_projects: "group projects",
  reading_writing_intensity: "reading/writing intensity",
  discussion_heavy: "discussion-heavy classes",
};

// ── Example input modal ───────────────────────────────────────────────────────

function ExampleInputModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      key="example-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-[900px] rounded-2xl border border-white/[0.08] p-7"
        style={{ background: "#0d1f38", boxShadow: "0 32px 80px rgba(0,0,0,0.7)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 rounded-lg p-1.5 text-hub-text-muted transition hover:text-hub-text"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="mb-5">
          <p className="font-[family-name:var(--font-outfit)] text-[18px] font-semibold text-hub-text">
            What to upload
          </p>
          <p className="mt-1 text-[16px] leading-relaxed text-hub-text-secondary">
            Use WebReg&apos;s List View for the best analysis.
          </p>
        </div>

        {/* Advisory banner */}
        <div className="mb-5 flex gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-sm text-amber-200/80">
            Our app is optimized for WebReg&apos;s <strong>List View</strong>. The Calendar View does not display
            exam dates, losing important information for your analysis.
          </p>
        </div>

        {/* Side-by-side comparison */}
        <div className="flex gap-5 items-start">
          {/* Preferred: horizontal list view */}
          <div className="flex-[3] min-w-0 space-y-3">
            <div className="overflow-hidden rounded-xl border-2 border-hub-cyan/40 ring-1 ring-hub-cyan/20 shadow-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/schedule1.png"
                alt="Horizontal list view — preferred"
                className="w-full object-cover block"
              />
            </div>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-hub-cyan/15 ring-1 ring-hub-cyan/40">
                <Check className="h-3.5 w-3.5 text-hub-cyan" />
              </span>
              <div>
                <p className="text-[18px] font-bold text-hub-cyan">Use This View</p>
                <p className="mt-0.5 text-[16px] text-hub-text-secondary leading-relaxed">
                  Horizontal list view: includes exam timings and full section detail for best analysis.
                </p>
                <p className="mt-5 text-[16px] leading-relaxed text-hub-text-muted">
                  In WebReg: <strong className="text-hub-text-secondary">Take a screenshot OR print schedule → Save File</strong>.
                </p>
              </div>
            </div>
          </div>

          {/* Not preferred: vertical calendar view */}
          <div className="flex-[2] min-w-0 space-y-3">
            <div className="overflow-hidden rounded-xl border border-white/[0.08] opacity-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/schedule2.png"
                alt="Vertical calendar view — not preferred"
                className="w-full object-cover block grayscale"
              />
            </div>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.05] ring-1 ring-white/[0.12]">
                <X className="h-3.5 w-3.5 text-hub-text-muted" />
              </span>
              <div>
                <p className="text-[18px] font-semibold text-hub-cyan">Avoid This View</p>
                <p className="mt-0.5 text-[16px] text-hub-text-muted leading-relaxed">
                  Vertical calendar view: missing exam info, leading to incomplete analysis.
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Idle preview card ─────────────────────────────────────────────────────────
const PREVIEW_DAYS = ["M", "T", "W", "Th", "F"] as const;

// col 0=Mon 1=Tue 2=Wed 3=Thu 4=Fri | top/h in px within a 108px tall column
const PREVIEW_BLOCKS = [
  { col: 0, top: 4,  h: 36, accent: "#00d4ff", label: "CSE 120" },
  { col: 2, top: 4,  h: 36, accent: "#00d4ff", label: "CSE 120" },
  { col: 4, top: 4,  h: 36, accent: "#00d4ff", label: "CSE 120" },
  { col: 1, top: 22, h: 28, accent: "#e3b12f", label: "MATH 18" },
  { col: 3, top: 22, h: 28, accent: "#e3b12f", label: "MATH 18" },
  { col: 0, top: 72, h: 24, accent: "#5eead4", label: "WCWP 10" },
  { col: 2, top: 60, h: 26, accent: "#a78bfa", label: "COGS 101" },
];

function IdlePreviewCard({ className = "" }: { className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={`overflow-hidden rounded-2xl border border-white/[0.08] bg-hub-surface ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-2.5">
        <span className="font-[family-name:var(--font-jetbrains-mono)] text-[13px] uppercase tracking-[0.13em] text-hub-text-muted">
          Example Calendar
        </span>
        <div className="flex items-center gap-1.5">
          <motion.span
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
            className="h-1.5 w-1.5 rounded-full bg-hub-success"
          />
          <span className="text-[11px] font-medium text-hub-success">Workload OK</span>
        </div>
      </div>

      {/* Mini weekly calendar */}
      <div className="p-3.5">
        {/* Day labels */}
        <div className="mb-2 flex gap-1.5">
          {PREVIEW_DAYS.map((d) => (
            <div
              key={d}
              className="flex-1 text-center font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-hub-text-muted"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Columns */}
        <div className="flex gap-1.5" style={{ height: 136 }}>
          {PREVIEW_DAYS.map((day, colIdx) => {
            const dayBlocks = PREVIEW_BLOCKS.filter((b) => b.col === colIdx);
            return (
              <div key={day} className="relative flex-1 rounded bg-white/[0.025]">
                {dayBlocks.map((block, bi) => (
                  <motion.div
                    key={bi}
                    initial={{ opacity: 0, scaleY: 0.5 }}
                    animate={{ opacity: 1, scaleY: 1 }}
                    transition={{
                      duration: 0.32,
                      delay: 0.52 + colIdx * 0.07 + bi * 0.05,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    style={{
                      position: "absolute",
                      top: block.top,
                      height: block.h,
                      left: 0,
                      right: 0,
                      backgroundColor: `${block.accent}18`,
                      borderLeft: `2px solid ${block.accent}99`,
                      transformOrigin: "top",
                    }}
                    className="rounded-r px-1 pt-1.5"
                  >
                    <span
                      className="block truncate font-[family-name:var(--font-jetbrains-mono)] text-[13px] font-bold leading-none"
                      style={{ color: block.accent }}
                    >
                      {block.label}
                    </span>
                  </motion.div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer — RMP snapshot */}
      <div className="flex items-center gap-4 border-t border-white/[0.05] px-4 py-2.5">
        {[
          { label: "CSE 120", rmp: "4.2", color: "#00d4ff" },
          { label: "MATH 18", rmp: "3.8", color: "#e3b12f" },
          { label: "WCWP 10", rmp: "4.7", color: "#5eead4" },
        ].map((c) => (
          <div key={c.label} className="flex items-center gap-1">
            <span className="font-[family-name:var(--font-jetbrains-mono)] text-[12px]" style={{ color: c.color }}>
              ★ {c.rmp}
            </span>
            <span className="text-[12px] text-hub-text-muted">{c.label}</span>
          </div>
        ))}
        <span className="ml-auto text-[11px] text-hub-text-muted/50">live via RMP</span>
      </div>
    </motion.div>
  );
}

// ── Inline-editable breadcrumb nav ───────────────────────────────────────────
function BreadcrumbNav({
  phase,
  quarterLabel,
  activePlanTitle,
  onRename,
  editable = true,
}: {
  phase: string;
  quarterLabel: string;
  activePlanTitle: string;
  onRename: (newTitle: string) => void;
  editable?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [emptyWarning, setEmptyWarning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const planName = activePlanTitle || quarterLabel || "New schedule";

  function open() {
    setDraft(planName);
    setEmptyWarning(false);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commit() {
    if (!draft.trim()) {
      setEmptyWarning(true);
      return;
    }
    onRename(draft.trim());
    setEditing(false);
    setEmptyWarning(false);
  }

  return (
    <nav
      className="mb-4 flex flex-wrap items-center gap-1 text-sm text-hub-text-muted"
      aria-label="Breadcrumb"
    >
      {phase === "dashboard" && (
        <>
          <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
          {editable && editing ? (
            <span className="flex items-center gap-1.5">
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => { setDraft(e.target.value); setEmptyWarning(false); }}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
                className="rounded border border-hub-cyan/40 bg-hub-bg/60 px-2 py-0.5 text-sm font-semibold text-hub-text outline-none focus:border-hub-cyan/70"
                style={{ minWidth: 120, maxWidth: 260 }}
              />
              {emptyWarning && (
                <span className="flex items-center gap-1 text-xs text-hub-danger">
                  <AlertCircle className="h-3 w-3" />
                  Cannot be empty
                </span>
              )}
            </span>
          ) : editable ? (
            <button
              type="button"
              onClick={open}
              title="Click to rename"
              className="group flex items-center gap-1 rounded px-1 py-0.5 font-semibold text-hub-cyan transition hover:bg-hub-cyan/10"
            >
              <span className="text-sm">{planName}</span>
              <span className="text-[9px] font-normal text-hub-text-muted/60 opacity-0 transition group-hover:opacity-100">
                Rename
              </span>
            </button>
          ) : (
            <span className="px-1 py-0.5 text-sm font-semibold text-hub-cyan">
              {planName}
            </span>
          )}
        </>
      )}
    </nav>
  );
}

export function CommandCenter() {
  const [phase, setPhase] = useState<UiPhase>("idle");
  const [ingestionCollapsed, setIngestionCollapsed] = useState(false);
  const [classes, setClasses] = useState<ClassDossier[]>(mockDossier.classes);
  const [evaluation, setEvaluation] = useState<ScheduleEvaluation>(mockDossier.evaluation);
  const [localCommitments, setLocalCommitments] = useState<ScheduleCommitment[]>([]);
  const [localCourseLabels, setLocalCourseLabels] = useState<Record<string, string>>({});
  const [demoPlanMeta, setDemoPlanMeta] = useState<{ title: string; quarterLabel: string | null } | null>(null);
  const [isExampleLoading, setIsExampleLoading] = useState(false);

  // Save flow state
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [showExampleModal, setShowExampleModal] = useState(false);

  // Upload error state (invalid image / rate limit)
  type UploadError =
    | { kind: "invalid_schedule"; message: string }
    | { kind: "rate_limited"; message: string; retryAfterSeconds: number };
  const [uploadError, setUploadError] = useState<UploadError | null>(null);
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);
  const [lookupCourseCode, setLookupCourseCode] = useState("");
  const [lookupProfessorName, setLookupProfessorName] = useState("");
  const countdownRef = useRef<number | null>(null);

  const startCountdown = useCallback((seconds: number) => {
    setRateLimitCountdown(seconds);
    if (countdownRef.current) window.clearInterval(countdownRef.current);
    countdownRef.current = window.setInterval(() => {
      setRateLimitCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(countdownRef.current!);
          countdownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleOpenLookup = useCallback(() => {
    window.dispatchEvent(new CustomEvent("hub:open-lookup", {
      detail: {
        query: lookupCourseCode.trim(),
        professorName: lookupProfessorName.trim(),
        autoSearch: true,
      },
    }));
  }, [lookupCourseCode, lookupProfessorName]);

  const workspaceRef = useRef<DossierScheduleWorkspaceHandle | null>(null);
  const timeoutsRef = useRef<number[]>([]);
  const processingLockRef = useRef(false);

  const clearRun = useCallback(() => {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutsRef.current = [];
  }, []);

  useEffect(() => () => clearRun(), [clearRun]);

  const clearExampleState = useCallback(() => {
    setLocalCommitments([]);
    setLocalCourseLabels({});
    setDemoPlanMeta(null);
  }, []);

  const resetDemo = useCallback(() => {
    clearRun();
    processingLockRef.current = false;
    setIsExampleLoading(false);
    clearExampleState();
    setLastSavedAt(null);
    setIsSaving(false);
    setSaveError(null);
    setPhase("idle");
    setIngestionCollapsed(false);
    setClasses(mockDossier.classes);
    setEvaluation(mockDossier.evaluation);
  }, [clearExampleState, clearRun]);

  const router = useRouter();

  // Plan-switch guard: ID of the plan the user wants to switch to (pending confirmation)
  const [pendingSwitchId, setPendingSwitchId] = useState<string | null>(null);

  // planSwitchKey: only incremented on explicit plan switches, not on saves.
  // Drives the phase/tab reset in DossierScheduleWorkspace so saving a new plan
  // doesn't yank the user back to the Overview tab.
  const [planSwitchKey, setPlanSwitchKey] = useState(0);

  // Toast notification for save feedback
  const [toast, setToast] = useState<ToastPayload | null>(null);

  // Delete warning: ID of plan pending deletion confirmation
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [submissionQuotaStatus, setSubmissionQuotaStatus] = useState<SubmissionQuotaStatus>(DEFAULT_SUBMISSION_QUOTA_STATUS);
  const [skipUploadConfirmation, setSkipUploadConfirmation] = useState(false);

  const {
    authed,
    isUcsdUser,
    activePlanId,
    setActivePlanId,
    quarterLabel,
    activePlanTitle,
    sidebarPlans,
    sidebarVault,
    viewClasses,
    viewEvaluation,
    viewCommitments,
    viewCourseLabels,
    isPlanLoading,
    handleSave,
    handleAutoSave,
    handleNewPlan,
    handleDeletePlan,
    handleRenamePlan,
  } = usePlanSync({
    phase,
    classes,
    evaluation,
    commitments: localCommitments,
    courseLabels: localCourseLabels,
    workspaceRef,
    onPlanCreated: resetDemo,
    onActivePlanDeleted: resetDemo,
    onPlanFromUrl: () => {
      clearExampleState();
      setPhase("dashboard");
    },
  });

  const handleGoHome = useCallback(() => {
    if (countdownRef.current) {
      window.clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setUploadError(null);
    setPendingSwitchId(null);
    setPendingDeleteId(null);
    setRateLimitCountdown(0);
    setActivePlanId("");
    resetDemo();
    router.replace("/");
  }, [resetDemo, router, setActivePlanId]);

  useEffect(() => {
    const onGoHome = () => handleGoHome();
    window.addEventListener("hub:go-home", onGoHome);
    return () => window.removeEventListener("hub:go-home", onGoHome);
  }, [handleGoHome]);

  const refreshSubmissionQuotaStatus = useCallback(async (): Promise<SubmissionQuotaStatus | null> => {
    if (!authed) {
      setSubmissionQuotaStatus(DEFAULT_SUBMISSION_QUOTA_STATUS);
      return DEFAULT_SUBMISSION_QUOTA_STATUS;
    }

    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_schedule_submission_quota_status");
      if (error) throw error;
      const normalized = normalizeQuotaStatus(data);
      if (!normalized) return null;
      setSubmissionQuotaStatus(normalized);
      return normalized;
    } catch (error) {
      console.error("refreshSubmissionQuotaStatus failed:", error);
      return null;
    }
  }, [authed]);

  useEffect(() => {
    void refreshSubmissionQuotaStatus();
  }, [refreshSubmissionQuotaStatus]);

  const refreshUploadPreferences = useCallback(async () => {
    if (!authed) {
      setSkipUploadConfirmation(false);
      return;
    }
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("skip_upload_confirmation")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      setSkipUploadConfirmation((data as { skip_upload_confirmation?: boolean } | null)?.skip_upload_confirmation ?? false);
    } catch (error) {
      console.error("refreshUploadPreferences failed:", error);
    }
  }, [authed]);

  useEffect(() => {
    void refreshUploadPreferences();
  }, [refreshUploadPreferences]);

  useEffect(() => {
    if (!pendingDeleteId || !authed) return;
    void refreshSubmissionQuotaStatus();
  }, [pendingDeleteId, authed, refreshSubmissionQuotaStatus]);

  const handleSkipUploadConfirmationChange = useCallback(async (next: boolean) => {
    if (!authed) {
      setSkipUploadConfirmation(next);
      return;
    }

    const previous = skipUploadConfirmation;
    setSkipUploadConfirmation(next);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error("User not found");

      const { error } = await supabase
        .from("profiles")
        .update({ skip_upload_confirmation: next })
        .eq("id", user.id);
      if (error) throw error;

      window.dispatchEvent(new CustomEvent("hub:profile-preferences-updated", {
        detail: { skipUploadConfirmation: next },
      }));
    } catch (error) {
      console.error("handleSkipUploadConfirmationChange failed:", error);
      setSkipUploadConfirmation(previous);
      setToast({ message: "Couldn't save upload preference", variant: "error" });
    }
  }, [authed, skipUploadConfirmation]);

  const consumeSubmissionQuotaSlot = useCallback(async (): Promise<SubmissionQuotaStatus | null> => {
    if (!authed) return DEFAULT_SUBMISSION_QUOTA_STATUS;
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("consume_schedule_submission_quota");
      if (error) throw error;
      const normalized = normalizeQuotaStatus(data);
      if (!normalized) return null;
      setSubmissionQuotaStatus(normalized);
      return normalized;
    } catch (error) {
      console.error("consumeSubmissionQuotaSlot failed:", error);
      return null;
    }
  }, [authed]);

  const switchToPlan = useCallback((id: string) => {
    if (authed) clearExampleState();
    setActivePlanId(id);
    setPhase("dashboard");
    setPlanSwitchKey((k) => k + 1);
  }, [authed, clearExampleState, setActivePlanId]);

  // Sync the active plan ID into the URL so refreshing the page restores the same plan.
  useEffect(() => {
    if (!authed) return;
    if (activePlanId && phase === "dashboard") {
      router.replace(`/?planId=${activePlanId}`);
    } else if (!activePlanId && phase === "idle") {
      router.replace("/");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlanId, phase, authed]);

  const handleSelectPlan = useCallback((id: string) => {
    if (id === activePlanId) return;
    const dirty = workspaceRef.current?.isDirty ?? false;
    if (dirty && phase === "dashboard") {
      setPendingSwitchId(id);
    } else {
      switchToPlan(id);
    }
  }, [activePlanId, phase, switchToPlan, workspaceRef]);

  const _isScheduleFile = (f: File | undefined): f is File =>
    !!f && (f.type.startsWith("image/") || f.type === "application/pdf");

  const loadProfileFitContext = useCallback(async (): Promise<ProfileFitContext | null> => {
    if (!authed) return null;

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "major,career_path,skill_preference,biggest_concerns,transit_mode,living_situation,commute_minutes,external_commitment_hours",
        )
        .eq("id", user.id)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      const context: ProfileFitContext = {
        major: data.major ?? undefined,
        careerPath: data.career_path ?? undefined,
        skillPreference: data.skill_preference ?? undefined,
        biggestConcerns: Array.isArray(data.biggest_concerns)
          ? data.biggest_concerns
              .map((c: string) => CONCERN_LABELS[c] ?? c)
              .filter((c: string) => c.trim().length > 0)
          : undefined,
        transitMode: data.transit_mode ?? undefined,
        livingSituation: data.living_situation ?? undefined,
        commuteMinutes: data.commute_minutes ?? undefined,
        externalCommitmentHours: data.external_commitment_hours ?? undefined,
      };

      return context;
    } catch {
      return null;
    }
  }, [authed]);

  const runIngestionFlow = useCallback(
    async (scheduleFile: File | undefined) => {
      if (processingLockRef.current) return;
      processingLockRef.current = true;

      if (_isScheduleFile(scheduleFile)) {
        const quotaGate = await consumeSubmissionQuotaSlot();
        if (!quotaGate) {
          processingLockRef.current = false;
          setUploadError({
            kind: "rate_limited",
            message: "Could not verify your submission quota right now. Please try again in a moment.",
            retryAfterSeconds: 30,
          });
          startCountdown(30);
          return;
        }
        if (!quotaGate.allowed) {
          const fallbackResetMs = Date.now() + Math.max(1, quotaGate.retryAfterSeconds) * 1000;
          const resetAtMs = quotaGate.resetsAt ? Date.parse(quotaGate.resetsAt) : fallbackResetMs;
          const retryAfterSeconds = Math.max(
            1,
            quotaGate.retryAfterSeconds || Math.ceil(Math.max(0, resetAtMs - Date.now()) / 1000),
          );
          processingLockRef.current = false;
          setUploadError({
            kind: "rate_limited",
            message: `You can submit up to ${quotaGate.limit} schedules every ${Math.ceil(quotaGate.windowSeconds / 3600)} hours. You can submit again at ${formatQuotaResetTime(resetAtMs)}.`,
            retryAfterSeconds,
          });
          startCountdown(retryAfterSeconds);
          setToast({ message: "Submission limit reached", variant: "error" });
          return;
        }
      }

      clearExampleState();
      clearRun();
      setPhase("processing");

      const started = Date.now();
      let nextClasses: ClassDossier[] = mockDossier.classes;
      let nextEvaluation: ScheduleEvaluation = mockDossier.evaluation;

      setUploadError(null);

      if (_isScheduleFile(scheduleFile)) {
        const imageFile = scheduleFile;
        try {
          const response = await researchScreenshot(imageFile);
          const parsed = response.results.map(courseResearchResultToDossier);
          if (parsed.length > 0) nextClasses = parsed;

          const minWaitPromise = new Promise<void>((resolve) => {
            const elapsed = Date.now() - started;
            const remaining = Math.max(0, FINISH_PAD_MS - elapsed);
            const id = window.setTimeout(() => resolve(), remaining);
            timeoutsRef.current.push(id);
          });
          // Always prefer backend-cached fit evaluation when available.
          // This keeps repeated uploads deterministic and skips an unnecessary Gemini call.
          const cachedFit = response.fit_evaluation ?? null;
          const fitPromise = cachedFit
            ? Promise.resolve(cachedFit)
            : (async () => {
                const fitContext = await loadProfileFitContext();
                return analyzeFit(response.results, fitContext ?? undefined);
              })().catch(() => null);
          const [fitResult] = await Promise.all([fitPromise, minWaitPromise]);

          if (fitResult) {
            nextEvaluation = {
              fitnessScore: fitResult.fitness_score,
              fitnessMax: fitResult.fitness_max,
              trendLabel: getScheduleDifficultyLabel(fitResult.fitness_score),
              categories: fitResult.categories ?? undefined,
              alerts: fitResult.alerts,
              recommendation: fitResult.recommendation,
              studyHoursMin: fitResult.study_hours_min,
              studyHoursMax: fitResult.study_hours_max,
              userInputFeedback: fitResult.user_input_feedback ?? undefined,
            };
          }
        } catch (err) {
          processingLockRef.current = false;
          setPhase("idle");

          if (err instanceof InvalidScheduleError) {
            setUploadError({ kind: "invalid_schedule", message: err.message });
            return;
          }
          if (err instanceof RateLimitedError) {
            setUploadError({ kind: "rate_limited", message: err.message, retryAfterSeconds: err.retryAfterSeconds });
            startCountdown(err.retryAfterSeconds);
            return;
          }
          console.error("runIngestionFlow: researchScreenshot failed:", err);
          return;
        }
      }

      if (nextClasses === mockDossier.classes || !_isScheduleFile(scheduleFile)) {
        const elapsed = Date.now() - started;
        const remaining = Math.max(0, FINISH_PAD_MS - elapsed);
        await new Promise<void>((resolve) => {
          const id = window.setTimeout(() => resolve(), remaining);
          timeoutsRef.current.push(id);
        });
      }

      clearRun();
      setClasses(nextClasses);
      setEvaluation(nextEvaluation);
      processingLockRef.current = false;
      setActivePlanId(""); // Clear stale plan reference so fresh upload data is shown
      setPhase("dashboard");
      setIngestionCollapsed(true);

      // Auto-save the researched schedule immediately so the user's work is persisted
      // without requiring an explicit "Save plan" click.
      if (authed && nextClasses !== mockDossier.classes) {
        setLastSavedAt(null);
        setSaveError(null);
        try {
          const newPlanId = await handleAutoSave(
            nextClasses,
            nextEvaluation,
            undefined,
          );
          if (newPlanId) setLastSavedAt(new Date());
        } catch {
          // Auto-save failure is non-blocking — user can still save manually
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearExampleState, clearRun, authed, consumeSubmissionQuotaSlot, handleAutoSave, loadProfileFitContext, startCountdown],
  );

  const handleViewExampleOutput = useCallback(async () => {
    clearRun();
    processingLockRef.current = false;
    setUploadError(null);
    setPendingSwitchId(null);
    setPendingDeleteId(null);
    setRateLimitCountdown(0);
    setLastSavedAt(null);
    setIsSaving(false);
    setSaveError(null);
    clearExampleState();
    setIsExampleLoading(true);

    try {
      const examplePlan = await fetchPublicDemoPlan();
      if (!examplePlan) throw new Error("Example plan unavailable");

      setClasses(examplePlan.classes);
      setEvaluation(examplePlan.evaluation);
      setLocalCommitments(examplePlan.commitments);
      setLocalCourseLabels(examplePlan.courseLabels);
      setDemoPlanMeta({
        title: examplePlan.title ?? "Example researched schedule",
        quarterLabel: examplePlan.quarterLabel,
      });
      setActivePlanId("");
      setPhase("dashboard");
      setIngestionCollapsed(true);
      router.replace("/");
    } catch {
      setToast({ message: "Couldn't load the example schedule", variant: "error" });
    } finally {
      setIsExampleLoading(false);
    }
  }, [clearExampleState, clearRun, router, setActivePlanId]);

  const handleManualSave = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      await handleSave();
      // Reset dirty state so isDirty goes false and the orange dot disappears.
      workspaceRef.current?.commit();
      setLastSavedAt(new Date());
      setToast({ message: "Plan saved", variant: "success" });
    } catch {
      setSaveError("Couldn't save your schedule. Please try again.");
      setToast({ message: "Couldn't save — please try again", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }, [handleSave, workspaceRef]);

  // Always require confirmation before deleting a saved plan.
  const handleDeleteWithWarning = useCallback((id: string) => {
    setPendingDeleteId(id);
  }, []);

  const handleSaveAndSwitch = useCallback(async () => {
    if (!pendingSwitchId) return;
    const targetId = pendingSwitchId;
    setPendingSwitchId(null);
    setIsSaving(true);
    setSaveError(null);
    try {
      await handleSave();
      workspaceRef.current?.commit();
      setLastSavedAt(new Date());
      setToast({ message: "Plan saved", variant: "success" });
    } catch {
      setToast({ message: "Save failed — switching anyway", variant: "error" });
    } finally {
      setIsSaving(false);
    }
    switchToPlan(targetId);
  }, [pendingSwitchId, handleSave, switchToPlan]);

  const handleFilesSelected = useCallback(
    (files: FileList | File[]) => {
      if (!authed || !isUcsdUser) return;
      const scheduleFile = Array.from(files).find(
        (f) => f.type.startsWith("image/") || f.type === "application/pdf",
      );
      void runIngestionFlow(scheduleFile);
    },
    [authed, isUcsdUser, runIngestionFlow],
  );

  const handleManualSubmit = useCallback(
    () => {
      if (!authed || !isUcsdUser) return;
      void runIngestionFlow(undefined);
    },
    [authed, isUcsdUser, runIngestionFlow],
  );

  const classCount = phase === "dashboard" ? viewClasses.length : classes.length;
  const isDemoView = demoPlanMeta !== null;
  const displayedQuarterLabel = demoPlanMeta?.quarterLabel ?? quarterLabel;
  const displayedActivePlanTitle = demoPlanMeta?.title ?? activePlanTitle;
  const nowMs = Date.now();
  const quotaResetAtMsRaw = submissionQuotaStatus.resetsAt ? Date.parse(submissionQuotaStatus.resetsAt) : NaN;
  const quotaResetAtMs = Number.isFinite(quotaResetAtMsRaw) ? quotaResetAtMsRaw : null;
  const quotaLimit = Math.max(1, submissionQuotaStatus.limit);
  const quotaWindowHours = Math.max(1, Math.ceil(submissionQuotaStatus.windowSeconds / 3600));
  const isQuotaWindowActive = quotaResetAtMs !== null && quotaResetAtMs > nowMs;
  const submissionCountRemaining = isQuotaWindowActive
    ? Math.max(0, Math.min(quotaLimit, submissionQuotaStatus.submissionsRemaining))
    : quotaLimit;
  const submissionResetAtLabel = isQuotaWindowActive && quotaResetAtMs !== null
    ? formatQuotaResetTime(quotaResetAtMs)
    : `${quotaWindowHours} hours after your first submission`;
  const deletionQuotaWarning = isQuotaWindowActive && quotaResetAtMs !== null
    ? `You have ${submissionCountRemaining} more potential submission${submissionCountRemaining === 1 ? "" : "s"} until ${formatQuotaResetTime(quotaResetAtMs)}.`
    : `You have ${submissionCountRemaining} potential submission${submissionCountRemaining === 1 ? "" : "s"} available. Your ${quotaWindowHours}-hour window starts with your first schedule submission.`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <LeftSidebar
          planSectionTitle={authed ? "Saved plans" : "My Quarters"}
          plans={sidebarPlans}
          activePlanId={activePlanId}
          onSelectPlan={handleSelectPlan}
          newPlanLabel={authed ? "New saved plan" : "New quarter research"}
          onNewPlan={authed ? handleNewPlan : undefined}
          onDeletePlan={authed ? handleDeleteWithWarning : undefined}
          onRenamePlan={authed ? handleRenamePlan : undefined}
          vaultItems={sidebarVault}
          vaultSynced={authed}
        />
        <main
          className={`relative min-w-0 flex-1 overflow-y-auto py-4 pb-10 ${
            phase === "dashboard" ? "px-4 lg:pl-3 lg:pr-8" : "px-4 lg:px-6"
          }`}
        >
          {/* ── UCSD Tritons full-page watermark (idle only) ── */}
          <AnimatePresence>
            {phase === "idle" && (
              <motion.div
                key="ucsd-bg"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                aria-hidden
                className="pointer-events-none select-none absolute inset-0 overflow-hidden"
              >
                <IdleWatermark />
              </motion.div>
            )}
          </AnimatePresence>
          <div
            className={`mx-auto w-full ${phase === "dashboard" ? "max-w-[min(100%,1760px)]" : "max-w-[min(100%,1420px)]"} ${phase === "processing" ? "pointer-events-none blur-[2px]" : ""}`}
          >
            <BreadcrumbNav
              phase={phase}
              quarterLabel={displayedQuarterLabel}
              activePlanTitle={displayedActivePlanTitle}
              editable={!isDemoView && !!activePlanId && authed}
              onRename={(newTitle) => {
                if (activePlanId && authed) {
                  void handleRenamePlan(activePlanId, newTitle);
                }
              }}
            />

            <AnimatePresence mode="popLayout">
              {phase === "idle" ? (
                <motion.div
                  key="idle-layout"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8, transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] } }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="relative space-y-14 lg:space-y-20"
                >

                  <motion.div
                    aria-hidden
                    animate={{ opacity: [0.05, 0.11, 0.05], scale: [1, 1.08, 1] }}
                    transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut', repeatType: 'mirror' }}
                    className='pointer-events-none absolute left-0 top-0 h-[440px] w-[440px] -translate-x-1/4 -translate-y-1/4 rounded-full bg-hub-cyan blur-[120px]'
                  />

                  <section className='relative px-1 py-2 lg:px-2 lg:py-3'>
                    <div className='relative max-w-2xl'>
                      <motion.h1
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                        className='font-[family-name:var(--font-outfit)] text-[clamp(2.45rem,5.6vw,4rem)] font-semibold leading-[0.96] tracking-[-0.042em] text-hub-text'
                      >
                        Stop guessing
                        <br />
                        your schedule.
                      </motion.h1> 
                    </div>

                    <div className='relative mt-8 grid gap-10'>
                      <div className='max-w-3xl'>
                        <motion.p
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                          className='mt-5 max-w-[700px] text-[16px] leading-8 text-hub-text-secondary/95 sm:text-[17px]'
                        >
                          Upload your WebReg screenshot. Get professor ratings, grade distributions, Reddit posts,
                          and a workload estimate for every class before you finalize anything.
                        </motion.p>
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.45, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
                          className='mt-8 flex flex-col gap-3 sm:flex-row'
                        >
                          <a
                            href='#attach-schedule'
                            className='inline-flex items-center justify-center gap-2 rounded-full border border-hub-cyan/40 bg-hub-cyan/12 px-5 py-3 text-sm font-semibold text-hub-cyan transition hover:border-hub-cyan/60 hover:bg-hub-cyan/18'
                          >
                            Attach your schedule
                            <ChevronRight className='h-4 w-4' />
                          </a>
                          <button
                            type='button'
                            onClick={() => setShowExampleModal(true)}
                            className='inline-flex items-center justify-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.02] px-5 py-3 text-sm font-medium text-hub-text-secondary transition hover:border-white/[0.24] hover:bg-white/[0.05] hover:text-hub-text'
                          >
                            <Images className='h-4 w-4' />
                            See what to upload
                          </button>
                        </motion.div>
                      </div>
                      <motion.div
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.45, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        className='max-w-[860px] rounded-[26px] border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5'
                      >
                        <p className='px-1 font-[family-name:var(--font-jetbrains-mono)] text-[11px] font-semibold uppercase tracking-[0.2em] text-hub-cyan/85'>
                          Quick flow
                        </p>
                        <div className='mt-3 space-y-1'>
                          {LANDING_JOURNEY_STEPS.map((item) => (
                            <div key={item.step} className='group grid grid-cols-[34px_minmax(0,1fr)] items-start gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-white/[0.04]'>
                              <span className='mt-[2px] inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.03] font-[family-name:var(--font-jetbrains-mono)] text-[11px] font-semibold tracking-[0.12em] text-hub-cyan/85'>
                                {item.step}
                              </span>
                              <div className='min-w-0 border-l border-white/[0.07] pl-3'>
                                <p className='text-sm font-semibold text-hub-text'>{item.title}</p>
                                <p className='mt-1 text-[13px] leading-6 text-hub-text-muted/85'>{item.detail}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    </div>
                  </section>

                  <section
                    id='attach-schedule'
                    className='mt-12 grid scroll-mt-6 gap-8 xl:grid-cols-[minmax(320px,0.78fr)_minmax(0,1.12fr)] xl:items-start lg:mt-16'
                  >
                    <motion.aside
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.36, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
                      className='relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-hub-surface/78 p-5 shadow-[0_24px_70px_rgba(2,12,27,0.22)] lg:p-6'
                    >
                      <div className='pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.12]' />
                      <p className='font-[family-name:var(--font-jetbrains-mono)] text-[11px] font-semibold uppercase tracking-[0.22em] text-hub-gold/90'>
                        Best results
                      </p>
                      <p className='mt-3 font-[family-name:var(--font-outfit)] text-[1.2rem] font-semibold tracking-[-0.03em] text-hub-text'>
                        Clear input helps.
                      </p>
                      <div className='mt-6 space-y-4'>
                        {[
                          'List view shows the most detail.',
                          'PDFs and screenshots both work.',
                          'Use the lookup section for a single class.',
                        ].map((note, index) => (
                          <div key={note} className='flex items-start gap-3'>
                            <span className='mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] font-[family-name:var(--font-jetbrains-mono)] text-[11px] font-semibold text-hub-text-muted'>
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <p className='text-sm leading-6 text-hub-text-secondary'>{note}</p>
                          </div>
                        ))}
                      </div>
                      <button
                        type='button'
                        onClick={() => setShowExampleModal(true)}
                        className='mt-6 inline-flex items-center gap-2 text-sm font-medium text-hub-text-secondary transition hover:text-hub-cyan'
                      >
                        <Images className='h-4 w-4' />
                        Open upload examples
                      </button>
                    </motion.aside>
                    <div className='space-y-4'>
                      <div className='max-w-2xl'>
                        <p className='font-[family-name:var(--font-jetbrains-mono)] text-[11px] font-semibold uppercase tracking-[0.22em] text-hub-cyan'>
                          01 / Attach your schedule
                        </p>
                        <h2 className='mt-3 font-[family-name:var(--font-outfit)] text-[clamp(1.6rem,3.2vw,2.55rem)] font-semibold leading-[1.04] tracking-[-0.04em] text-hub-text'>
                          Upload your WebReg schedule.
                        </h2>
                        <p className='mt-4 max-w-[760px] text-[16px] leading-8 text-hub-text-secondary sm:text-[17px]'>
                          List view, PDF, or screenshot all work.
                        </p>
                      </div>
                      <IngestionHub
                        phase={phase}
                        collapsed={ingestionCollapsed}
                        onToggleCollapse={() => setIngestionCollapsed((c) => !c)}
                        onFilesSelected={handleFilesSelected}
                        onOpenUploadFormatModal={() => setShowExampleModal(true)}
                        submissionUsesLeft={submissionCountRemaining}
                        submissionResetsAtLabel={submissionResetAtLabel}
                        skipUploadConfirmation={skipUploadConfirmation}
                        onSkipUploadConfirmationChange={handleSkipUploadConfirmationChange}
                        onManualSubmit={handleManualSubmit}
                        classCount={classCount}
                        quarterLabel={displayedQuarterLabel}
                        isLocked={!authed || !isUcsdUser}
                      />
                      {!authed ? (
                        <div className='max-w-2xl border-t border-white/[0.08] pt-4'>
                          <p className='text-sm font-semibold text-hub-text'>
                            Preview an example output before signing in
                          </p>
                          <p className='mt-1.5 text-sm leading-relaxed text-hub-text-secondary'>
                            Open a researched sample schedule to preview the dashboard, professor data, and workload analysis.
                          </p>
                          <button
                            type='button'
                            onClick={handleViewExampleOutput}
                            disabled={isExampleLoading}
                            className='mt-3 inline-flex items-center gap-2 rounded-lg border border-hub-cyan/30 bg-hub-cyan/[0.08] px-4 py-2 text-sm font-medium text-hub-cyan transition hover:border-hub-cyan/50 hover:bg-hub-cyan/[0.14] disabled:cursor-wait disabled:opacity-60'
                          >
                            {isExampleLoading ? "Loading example..." : "View example schedule"}
                          </button>
                        </div>
                      ) : null}
                      {authed && !isUcsdUser ? (
                        <div className='max-w-2xl border-t border-white/[0.08] pt-4'>
                          <p className='text-sm font-semibold text-hub-text'>
                            Schedule upload is UCSD-verified
                          </p>
                          <p className='mt-1.5 text-sm leading-relaxed text-hub-text-secondary'>
                            Link a <span className='text-hub-text'>@ucsd.edu</span> address in{" "}
                            <a href='/profile' className='text-hub-cyan hover:underline'>
                              Profile
                            </a>{" "}
                            (Link email), or use Google sign-in with a school email, to unlock WebReg uploads. Community and the rest of the hub stay available with any account.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </section>

                  <section
                    id='class-lookup'
                    className='mt-14 grid scroll-mt-6 gap-6 xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)] xl:items-start xl:gap-10 lg:mt-20'
                  >
                    <div className='rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] p-6 lg:p-8'>
                      <p className='font-[family-name:var(--font-jetbrains-mono)] text-[11px] font-semibold uppercase tracking-[0.22em] text-hub-cyan'>
                        02 / Look up a class or professor
                      </p>
                      <h2 className='mt-3 max-w-[16ch] font-[family-name:var(--font-outfit)] text-[clamp(1.45rem,2.8vw,2.1rem)] font-semibold leading-[1.06] tracking-[-0.04em] text-hub-text'>
                        Look up a class or professor.
                      </h2>
                      <p className='mt-4 max-w-[540px] text-[16px] leading-8 text-hub-text-secondary'>
                        Search by course code or professor name for fast lookup.
                      </p>
                    </div>
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.36, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
                      className='rounded-[28px] border border-white/[0.08] bg-hub-surface/80 p-5 shadow-[0_24px_70px_rgba(2,12,27,0.24)] lg:p-6'
                    >
                      <div className='mb-4 flex items-start gap-3'>
                        <span className='mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-hub-cyan/25 bg-hub-cyan/10 text-hub-cyan'>
                          <GraduationCap className='h-4 w-4' />
                        </span>
                        <div>
                          <p className='text-[15px] font-semibold text-hub-text'>Search</p>
                          <p className='mt-1 text-sm leading-6 text-hub-text-muted'>
                            Preview ratings, grade trends, and community signals.
                          </p>
                        </div>
                      </div>
                      <div className='grid grid-cols-1 gap-3 sm:grid-cols-[1.1fr_1fr]'>
                        <label className='flex min-w-0 items-center gap-2.5 rounded-2xl border border-white/[0.10] bg-[#0d1f35]/75 px-4 py-3 transition focus-within:border-hub-cyan/40 focus-within:ring-1 focus-within:ring-hub-cyan/20'>
                          <Search className='h-4 w-4 shrink-0 text-white/40' />
                          <input
                            type='text'
                            value={lookupCourseCode}
                            onChange={(e) => setLookupCourseCode(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleOpenLookup();
                              }
                            }}
                            placeholder='Course code (e.g. CSE 120)'
                            className='min-w-0 flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/30 outline-none'
                          />
                        </label>
                        <label className='flex min-w-0 items-center gap-2.5 rounded-2xl border border-white/[0.10] bg-[#0d1f35]/75 px-4 py-3 transition focus-within:border-hub-cyan/40 focus-within:ring-1 focus-within:ring-hub-cyan/20'>
                          <GraduationCap className='h-4 w-4 shrink-0 text-white/40' />
                          <input
                            type='text'
                            value={lookupProfessorName}
                            onChange={(e) => setLookupProfessorName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleOpenLookup();
                              }
                            }}
                            placeholder='Professor (optional)'
                            className='min-w-0 flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/30 outline-none'
                          />
                        </label>
                        <button
                          type='button'
                          onClick={handleOpenLookup}
                          className='inline-flex items-center justify-center gap-2 rounded-2xl border border-white/[0.12] bg-hub-surface-elevated px-4 py-3 text-sm font-medium text-hub-text transition hover:border-hub-cyan/35 hover:text-hub-cyan sm:col-span-2'
                        >
                          Search
                          <ChevronRight className='h-4 w-4' />
                        </button>
                      </div>
                    </motion.div>
                  </section>

                  <section
                    id='what-you-get'
                    className='relative mt-14 scroll-mt-6 lg:mt-20 lg:px-8 lg:py-8 xl:px-10 xl:py-10'
                  >
                    <div className='pointer-events-none absolute left-[-10%] top-[14%] h-[220px] w-[220px] rounded-full bg-hub-cyan/10 blur-[100px]' />
                    <div className='relative'>
                      <div className='max-w-2xl'>
                        <p className='font-[family-name:var(--font-jetbrains-mono)] text-[11px] font-semibold uppercase tracking-[0.22em] text-hub-cyan'>
                          03 / What you get
                        </p>
                        <h2 className='mt-3 font-[family-name:var(--font-outfit)] text-[clamp(1.5rem,2.9vw,2.2rem)] font-semibold leading-[1.06] tracking-[-0.04em] text-hub-text'>
                          Calendar and summary.
                        </h2>
                        <p className='mt-4 max-w-[760px] text-[16px] leading-8 text-hub-text-secondary sm:text-[17px]'>
                          Weekly calendar, ratings, and workload in one place.
                        </p>
                      </div>
                      <div className='mt-8 grid gap-8 xl:grid-cols-[minmax(0,1.02fr)_minmax(340px,0.98fr)] xl:items-start'>
                        <div className='space-y-4'>
                          <IdlePreviewCard className='shadow-[0_24px_70px_rgba(2,12,27,0.28)]' />
                          <div className='rounded-[22px] border border-white/[0.08] bg-white/[0.03] px-4 py-4 text-sm leading-7 text-hub-text-secondary'>
                            The calendar, ratings, and workload score stay together.
                          </div>
                        </div>
                        <div className='grid gap-3 sm:grid-cols-2'>
                          {WHAT_YOU_GET.map((item, i) => (
                            <motion.div
                              key={item.label}
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.26, delay: 0.28 + i * 0.045, ease: [0.22, 1, 0.36, 1] }}
                              className='rounded-[22px] border border-white/[0.06] bg-white/[0.03] px-4 py-4 transition-colors duration-150 hover:border-white/[0.12] hover:bg-white/[0.05]'
                            >
                              <div className='font-[family-name:var(--font-jetbrains-mono)] text-[13px] font-bold tabular-nums text-hub-cyan'>
                                {String(i + 1).padStart(2, '0')}
                              </div>
                              <p className='mt-3 text-[13px] font-semibold leading-6 text-hub-text'>{item.label}</p>
                              <p className='mt-1.5 text-[13px] leading-6 text-hub-text-muted/85'>{item.detail}</p>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>
                </motion.div>

              ) : phase === "dashboard" ? (
                <motion.div
                  key="dashboard"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-4"
                >
                  {isDemoView && (
                    <div className="rounded-xl border border-hub-cyan/20 bg-hub-cyan/[0.06] px-4 py-3 text-sm text-hub-text-secondary">
                      <p className="font-semibold text-hub-text">Example researched schedule</p>
                      <p className="mt-1">
                        This is a read-only sample for visitors without a UCSD email. Sign in with your UCSD account to analyze and save your own schedule.
                      </p>
                    </div>
                  )}
                  {isPlanLoading ? (
                    <motion.div
                      key="plan-loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-white/[0.06] bg-hub-surface/60 py-24"
                    >
                      <div className="relative h-8 w-8">
                        <div className="absolute inset-0 animate-spin rounded-full border-2 border-white/[0.08] border-t-hub-cyan/70" />
                      </div>
                      <p className="font-[family-name:var(--font-outfit)] text-sm text-hub-text-muted">
                        Loading plan…
                      </p>
                    </motion.div>
                  ) : viewClasses.length === 0 ? (
                    <p className="rounded-xl border border-white/[0.08] bg-hub-bg/40 px-4 py-8 text-center text-sm text-hub-text-muted">
                      No schedule data for this plan yet. Upload your schedule above or select another saved plan.
                    </p>
                  ) : (
                    <DossierScheduleWorkspace
                      viewClasses={viewClasses}
                      evaluation={viewEvaluation}
                      hydrateKey={`${activePlanId}:${authed}`}
                      planSwitchKey={planSwitchKey}
                      calendarSyncTitle={displayedActivePlanTitle || displayedQuarterLabel || "Reg2Schedg Schedule"}
                      scheduleItems={dossiersToScheduleItems(viewClasses)}
                      transitionInsights={[]}
                      initialCommitments={viewCommitments}
                      initialCourseLabels={viewCourseLabels}
                      ref={workspaceRef}
                      onSave={authed && !isDemoView ? handleManualSave : undefined}
                      isSaving={isSaving}
                      lastSavedAt={lastSavedAt}
                      saveError={saveError}
                    />
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </main>

      </div>

      <ProcessingModal open={phase === "processing"} />

      <AnimatePresence>
        {phase !== "processing" && uploadError && (
          <motion.div
            key="upload-error-popup"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none fixed inset-0 z-[78] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className={`pointer-events-auto relative w-full max-w-md rounded-2xl border p-5 shadow-2xl ${
                uploadError.kind === "rate_limited"
                  ? "border-hub-gold/35 bg-hub-surface-elevated"
                  : "border-hub-danger/35 bg-hub-surface-elevated"
              }`}
            >
              <button
                type="button"
                onClick={() => setUploadError(null)}
                className="absolute right-3 top-3 rounded-lg p-1.5 text-hub-text-muted transition hover:bg-white/[0.05] hover:text-hub-text"
                aria-label="Dismiss warning"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex items-start gap-3 pr-8">
                {uploadError.kind === "rate_limited" ? (
                  <Clock className="mt-0.5 h-5 w-5 shrink-0 text-hub-gold" />
                ) : (
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-hub-danger" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={`text-[13px] font-semibold ${uploadError.kind === "rate_limited" ? "text-hub-gold" : "text-hub-danger"}`}>
                    {uploadError.kind === "rate_limited" ? "Upload temporarily blocked" : "Invalid schedule detected"}
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-hub-text-secondary">
                    {uploadError.message}
                  </p>
                  {uploadError.kind === "rate_limited" && rateLimitCountdown > 0 && (
                    <p className="mt-2 font-[family-name:var(--font-jetbrains-mono)] text-[13px] text-hub-gold/80">
                      Unblocked in {Math.floor(rateLimitCountdown / 60)}:{String(rateLimitCountdown % 60).padStart(2, "0")}
                    </p>
                  )}
                  <p className="mt-2 text-[13px] text-hub-text-muted/80">
                    Please review this warning and close it when you are ready.
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Unsaved-changes guard modal ── */}
      <AnimatePresence>
        {pendingSwitchId && (
          <motion.div
            key="switch-guard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setPendingSwitchId(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-sm rounded-2xl border border-white/[0.10] bg-hub-surface-elevated p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="font-[family-name:var(--font-outfit)] text-base font-semibold text-hub-text">
                Unsaved changes
              </p>
              <p className="mt-2 text-sm leading-relaxed text-hub-text-muted">
                You have unsaved edits to this plan. What would you like to do before switching?
              </p>
              <div className="mt-5 flex flex-col gap-2">
                {authed && (
                  <button
                    type="button"
                    onClick={() => void handleSaveAndSwitch()}
                    disabled={isSaving}
                    className="w-full rounded-xl bg-hub-cyan px-4 py-2.5 text-sm font-semibold text-hub-bg transition hover:bg-hub-cyan/85 disabled:opacity-50"
                  >
                    {isSaving ? "Saving…" : "Save & switch"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const id = pendingSwitchId;
                    setPendingSwitchId(null);
                    switchToPlan(id);
                  }}
                  className="w-full rounded-xl border border-white/[0.10] px-4 py-2.5 text-sm font-medium text-hub-text-secondary transition hover:bg-white/[0.04] hover:text-hub-text"
                >
                  Discard changes &amp; switch
                </button>
                <button
                  type="button"
                  onClick={() => setPendingSwitchId(null)}
                  className="w-full px-4 py-2 text-sm font-medium text-hub-text-muted transition hover:text-hub-text"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Delete warning modal ── */}
      <AnimatePresence>
        {pendingDeleteId && (
          <motion.div
            key="delete-guard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setPendingDeleteId(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-sm rounded-2xl border border-white/[0.10] bg-hub-surface-elevated p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2.5">
                <Trash2 className="h-4 w-4 text-hub-danger" />
                <p className="font-[family-name:var(--font-outfit)] text-base font-semibold text-hub-text">
                  Delete this saved plan?
                </p>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-hub-text-muted">
                Are you sure you want to delete this plan? {deletionQuotaWarning}
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const id = pendingDeleteId;
                    setPendingDeleteId(null);
                    void handleDeletePlan(id);
                  }}
                  className="w-full rounded-xl bg-hub-danger/90 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-hub-danger"
                >
                  Delete anyway
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(null)}
                  className="w-full px-4 py-2 text-sm font-medium text-hub-text-muted transition hover:text-hub-text"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showExampleModal && (
          <ExampleInputModal onClose={() => setShowExampleModal(false)} />
        )}
      </AnimatePresence>

      <HubToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

