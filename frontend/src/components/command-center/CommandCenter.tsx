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
import { createClient } from "@/lib/supabase/client";
import { mockDossier } from "@/lib/mock/dossier";
import { analyzeFit, researchScreenshot, InvalidScheduleError, RateLimitedError } from "@/lib/api/parse";
import { courseResearchResultToDossier } from "@/lib/mappers/courseEntryToDossier";
import { dossiersToScheduleItems } from "@/lib/mappers/dossiersToScheduleItems";
import type { ClassDossier, ScheduleEvaluation, UiPhase } from "@/types/dossier";

const FINISH_PAD_MS = 650;

const WHAT_YOU_GET = [
  { label: "PROFESSOR RATINGS", detail: "RMP scores + teaching style pulled live for your section" },
  { label: "GRADE DISTRIBUTIONS", detail: "CAPE/SunSET A–F breakdowns for every course" },
  { label: "COMMUNITY DISCUSSIONS", detail: "Reddit r/UCSD threads ranked by relevance" },
  { label: "WORKLOAD SCORE", detail: "A ranked estimate of how survivable your full schedule and workload is" },
  { label: "CUSTOMIZABLE CALENDAR", detail: "Drag-reschedulable weekly view with custom commitments and export to Google Calendar" },
  { label: "MAP VISUALIZATION", detail: "Interactive campus map showing class locations and walking patterns between buildings" },
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

function IdlePreviewCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="mb-4 overflow-hidden rounded-2xl border border-white/[0.08] bg-hub-surface"
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
}: {
  phase: string;
  quarterLabel: string;
  activePlanTitle: string;
  onRename: (newTitle: string) => void;
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
          {editing ? (
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
                  Can't be empty
                </span>
              )}
            </span>
          ) : (
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
  const [lookupQuery, setLookupQuery] = useState("");
  const countdownRef = useRef<number | null>(null);

  const startCountdown = useCallback((seconds: number) => {
    setRateLimitCountdown(seconds);
    if (countdownRef.current) window.clearInterval(countdownRef.current);
    countdownRef.current = window.setInterval(() => {
      setRateLimitCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(countdownRef.current!);
          countdownRef.current = null;
          setUploadError(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleOpenLookup = useCallback(() => {
    window.dispatchEvent(new CustomEvent("hub:open-lookup", { detail: { query: lookupQuery } }));
  }, [lookupQuery]);

  useEffect(() => {
    if (!uploadError) return;
    const dismissId = window.setTimeout(() => setUploadError(null), 5000);
    return () => window.clearTimeout(dismissId);
  }, [uploadError]);

  const workspaceRef = useRef<DossierScheduleWorkspaceHandle | null>(null);
  const timeoutsRef = useRef<number[]>([]);
  const processingLockRef = useRef(false);

  const clearRun = useCallback(() => {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutsRef.current = [];
  }, []);

  useEffect(() => () => clearRun(), [clearRun]);

  const resetDemo = useCallback(() => {
    clearRun();
    processingLockRef.current = false;
    setPhase("idle");
    setIngestionCollapsed(false);
    setClasses(mockDossier.classes);
    setEvaluation(mockDossier.evaluation);
  }, [clearRun]);

  const router = useRouter();

  // Plan-switch guard: ID of the plan the user wants to switch to (pending confirmation)
  const [pendingSwitchId, setPendingSwitchId] = useState<string | null>(null);

  // planSwitchKey: only incremented on explicit plan switches, not on saves.
  // Drives the phase/tab reset in DossierScheduleWorkspace so saving a new plan
  // doesn't yank the user back to the Overview tab.
  const [planSwitchKey, setPlanSwitchKey] = useState(0);

  // Toast notification for save feedback
  const [toast, setToast] = useState<ToastPayload | null>(null);

  // Last-plan delete warning: ID of plan pending deletion confirmation
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

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
    workspaceRef,
    onPlanCreated: resetDemo,
    onActivePlanDeleted: resetDemo,
    onPlanFromUrl: () => setPhase("dashboard"),
  });

  const switchToPlan = useCallback((id: string) => {
    setActivePlanId(id);
    setPhase("dashboard");
    setPlanSwitchKey((k) => k + 1);
  }, [setActivePlanId]);

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
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "major,career_path,skill_preference,biggest_concerns,transit_mode,living_situation,commute_minutes,external_commitment_hours",
        )
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      const context: ProfileFitContext = {
        major: data.major ?? undefined,
        careerPath: data.career_path ?? undefined,
        skillPreference: data.skill_preference ?? undefined,
        biggestConcerns: data.biggest_concerns ?? undefined,
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

      const fitContext = await loadProfileFitContext();

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

          // Use cached fit evaluation when the fast-path returned one —
          // avoids a redundant Gemini call and keeps the score deterministic.
          // If profile context exists, always re-run fit analysis so output is personalized.
          const cachedFit = fitContext ? null : (response.fit_evaluation ?? null);
          const [fitResult] = await Promise.all([
            cachedFit
              ? Promise.resolve(cachedFit)
              : analyzeFit(response.results, fitContext ?? undefined).catch(() => null),
            minWaitPromise,
          ]);

          if (fitResult) {
            nextEvaluation = {
              fitnessScore: fitResult.fitness_score,
              fitnessMax: fitResult.fitness_max,
              trendLabel: fitResult.trend_label,
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
    [clearRun, authed, handleAutoSave, loadProfileFitContext],
  );

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

  // Guard against deleting the last plan: show a warning modal first.
  const handleDeleteWithWarning = useCallback((id: string) => {
    if (sidebarPlans.length === 1) {
      setPendingDeleteId(id);
    } else {
      void handleDeletePlan(id);
    }
  }, [sidebarPlans.length, handleDeletePlan]);

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
    (_payload: { professor: string; course: string; quarter: string }) => {
      void runIngestionFlow(undefined);
    },
    [runIngestionFlow],
  );

  const classCount = phase === "dashboard" ? viewClasses.length : classes.length;

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
              quarterLabel={quarterLabel}
              activePlanTitle={activePlanTitle}
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
                  className="relative grid grid-cols-1 gap-8 lg:grid-cols-[6fr_5fr] lg:gap-12 xl:gap-14"
                >

                  {/* ── Col 1: Problem statement + action ── */}
                  <div className="relative">
                    {/* Ambient glow */}
                    <motion.div
                      aria-hidden
                      animate={{ opacity: [0.06, 0.13, 0.06], scale: [1, 1.1, 1] }}
                      transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", repeatType: "mirror" }}
                      className="pointer-events-none absolute left-0 top-0 h-[480px] w-[480px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-hub-cyan blur-[100px]"
                    />
                    <div className="relative mb-8">
                      <motion.h1
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                        className="font-[family-name:var(--font-outfit)] text-[2.75rem] font-bold leading-[1.06] tracking-tight text-hub-text lg:text-[3.5rem]"
                      >
                        Stop guessing<br />your schedule.
                      </motion.h1>
                      <motion.p
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                        className="mt-5 max-w-[520px] text-[18px] leading-[1.68] text-hub-text-secondary"
                      >
                        Upload your WebReg screenshot. Get professor ratings, grade distributions, Reddit posts, and a workload estimate for every class, before you finalize anything.
                      </motion.p>
                    </div>

                    <motion.button
                      type="button"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.4, delay: 0.15 }}
                      onClick={() => setShowExampleModal(true)}
                      className="mb-4 flex items-center gap-2 text-[18px] text-hub-text-secondary transition hover:text-hub-cyan"
                    >
                      <Images className="h-4 w-4" />
                      See what to upload
                    </motion.button>

                    <IngestionHub
                      phase={phase}
                      collapsed={ingestionCollapsed}
                      onToggleCollapse={() => setIngestionCollapsed((c) => !c)}
                      onFilesSelected={handleFilesSelected}
                      onManualSubmit={handleManualSubmit}
                      classCount={classCount}
                      quarterLabel={quarterLabel}
                      isLocked={!authed || !isUcsdUser}
                    />

                  </div>

                  {/* ── Col 2: Sample output + feature list ── */}
                  <div className="flex flex-col gap-5 lg:pt-1">

                    {/* What you get label */}
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.35, delay: 0.38, ease: [0.22, 1, 0.36, 1] }}
                      className="text-[15px] font-bold uppercase tracking-[0.18em] text-hub-cyan"
                    >
                      What you get
                    </motion.p>

                    <IdlePreviewCard />

                    {/* Separator */}
                    <div className="h-px bg-white/[0.05]" />

                    {/* Feature chips — 2 columns, scoped to this panel */}
                    <div className="grid grid-cols-2 gap-2.5">
                      {WHAT_YOU_GET.map((item, i) => (
                        <motion.div
                          key={item.label}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.26, delay: 0.44 + i * 0.048, ease: [0.22, 1, 0.36, 1] }}
                          className="cursor-default rounded-xl border border-white/[0.06] bg-hub-surface/70 px-3.5 py-3.5 transition-colors duration-150 hover:border-white/[0.11] hover:bg-hub-surface"
                        >
                          <div className="mb-1.5 font-[family-name:var(--font-jetbrains-mono)] text-[15px] font-bold tabular-nums text-hub-cyan">
                            {String(i + 1).padStart(2, "0")}
                          </div>
                          <div className="text-[13px] font-semibold leading-snug text-hub-text">
                            {item.label}
                          </div>
                        </motion.div>
                      ))}
                    </div>

                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.26, delay: 0.76, ease: [0.22, 1, 0.36, 1] }}
                      className="rounded-xl border border-white/[0.08] bg-hub-surface/75 p-4"
                    >
                      <div className="mb-3 flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-hub-cyan/25 bg-hub-cyan/10 text-hub-cyan">
                          <GraduationCap className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-[14px] font-semibold text-hub-text">Look up a class or professor</p>
                          <p className="mt-0.5 text-[12px] leading-relaxed text-hub-text-muted">
                            Search any class or instructor to preview ratings, grade trends, and community signals.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2.5 sm:flex-row">
                        <label className="relative block min-w-0 flex-1">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-hub-text-muted" />
                          <input
                            type="text"
                            value={lookupQuery}
                            onChange={(e) => setLookupQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleOpenLookup();
                              }
                            }}
                            placeholder="CSE 120, MATH 18, Prof. Smith..."
                            className="w-full rounded-lg border border-white/[0.10] bg-white/[0.03] py-2.5 pl-9 pr-3 text-[13px] text-hub-text placeholder:text-hub-text-muted outline-none transition focus:border-hub-cyan/40 focus:ring-1 focus:ring-hub-cyan/20"
                          />
                        </label>

                        <button
                          type="button"
                          onClick={handleOpenLookup}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-hub-cyan/35 bg-hub-cyan/15 px-4 py-2.5 text-[13px] font-semibold text-hub-cyan transition hover:bg-hub-cyan/25"
                        >
                          Search
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  </div>

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
                      scheduleItems={dossiersToScheduleItems(viewClasses)}
                      transitionInsights={[]}
                      initialCommitments={viewCommitments}
                      initialCourseLabels={viewCourseLabels}
                      ref={workspaceRef}
                      onSave={authed ? handleManualSave : undefined}
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
        {phase === "idle" && uploadError && (
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
                    This message will close automatically in about 5 seconds.
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

      {/* ── Last-plan delete warning modal ── */}
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
                  Delete your only saved plan?
                </p>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-hub-text-muted">
                This plan will be removed from your account. You can always research a new schedule and save it again.
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
