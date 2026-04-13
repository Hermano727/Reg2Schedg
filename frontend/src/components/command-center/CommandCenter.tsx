"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { IngestionHub } from "@/components/ingestion/IngestionHub";
import { ProcessingModal } from "@/components/modals/ProcessingModal";
import { DossierScheduleWorkspace, type DossierScheduleWorkspaceHandle } from "@/components/dashboard/DossierScheduleWorkspace";
import { SaveMenu } from "@/components/command-center/SaveMenu";
import { usePlanSync } from "@/hooks/usePlanSync";
import { mockDossier } from "@/lib/mock/dossier";
import { buildPayloadFromClasses } from "@/lib/hub/plan-payload";
import { analyzeFit, researchScreenshot } from "@/lib/api/parse";
import { courseResearchResultToDossier } from "@/lib/mappers/courseEntryToDossier";
import { dossiersToScheduleItems } from "@/lib/mappers/dossiersToScheduleItems";
import type { ClassDossier, ScheduleEvaluation, UiPhase } from "@/types/dossier";

const LINE_MS = 360;
const FINISH_PAD_MS = 650;

const WHAT_YOU_GET = [
  { label: "PROFESSOR RATINGS", detail: "RMP scores + teaching style pulled live for your section" },
  { label: "GRADE DISTRIBUTIONS", detail: "CAPE/SunSET A–F breakdowns for every course" },
  { label: "STUDENT POSTS", detail: "Reddit r/UCSD threads ranked by relevance" },
  { label: "WORKLOAD SCORE", detail: "A ranked estimate of how survivable your full schedule and workload is" },
  { label: "CUSTOMIZABLE CALENDAR", detail: "Drag-reschedulable weekly view with custom commitments and export to Google Calendar" },
  { label: "MAP VISUALIZATION", detail: "Interactive campus map showing class locations and walking patterns between buildings" },
  { label: "COMMUNITY CENTER", detail: "Chat with other students to gain insights on courses and professors!"}
] as const;

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
      className="mb-4 overflow-hidden rounded-xl border border-white/[0.08] bg-hub-surface"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.05] px-3 py-2">
        <span className="font-[family-name:var(--font-jetbrains-mono)] text-[9px] uppercase tracking-[0.13em] text-hub-text-muted">
          Spring 2026 · 16 units
        </span>
        <div className="flex items-center gap-1.5">
          <motion.span
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
            className="h-1.5 w-1.5 rounded-full bg-hub-success"
          />
          <span className="text-[9px] font-medium text-hub-success">Workload OK</span>
        </div>
      </div>

      {/* Mini weekly calendar */}
      <div className="p-2.5">
        {/* Day labels */}
        <div className="mb-1.5 flex gap-1">
          {PREVIEW_DAYS.map((d) => (
            <div
              key={d}
              className="flex-1 text-center font-[family-name:var(--font-jetbrains-mono)] text-[8.5px] text-hub-text-muted"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Columns */}
        <div className="flex gap-1" style={{ height: 108 }}>
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
                    className="rounded-r px-1 pt-0.5"
                  >
                    <span
                      className="block truncate font-[family-name:var(--font-jetbrains-mono)] text-[6.5px] font-bold leading-none"
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
      <div className="flex items-center gap-3 border-t border-white/[0.05] px-3 py-2">
        {[
          { label: "CSE 120", rmp: "4.2", color: "#00d4ff" },
          { label: "MATH 18", rmp: "3.8", color: "#e3b12f" },
          { label: "WCWP 10", rmp: "4.7", color: "#5eead4" },
        ].map((c) => (
          <div key={c.label} className="flex items-center gap-1">
            <span className="font-[family-name:var(--font-jetbrains-mono)] text-[7.5px]" style={{ color: c.color }}>
              ★ {c.rmp}
            </span>
            <span className="text-[7.5px] text-hub-text-muted">{c.label}</span>
          </div>
        ))}
        <span className="ml-auto text-[7.5px] text-hub-text-muted/50">live via RMP</span>
      </div>
    </motion.div>
  );
}

export function CommandCenter() {
  const [phase, setPhase] = useState<UiPhase>("idle");
  const [ingestionCollapsed, setIngestionCollapsed] = useState(false);
  const [classes, setClasses] = useState<ClassDossier[]>(mockDossier.classes);
  const [evaluation, setEvaluation] = useState<ScheduleEvaluation>(mockDossier.evaluation);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);

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

  const {
    authed,
    activePlanId,
    setActivePlanId,
    quarterLabel,
    sidebarPlans,
    sidebarVault,
    viewClasses,
    viewEvaluation,
    viewCommitments,
    persistCompletedSession,
    handleSaveOverwrite,
    handleSaveAsNew,
    handleNewPlan,
    handleDeletePlan,
  } = usePlanSync({
    phase,
    classes,
    evaluation,
    workspaceRef,
    onPlanCreated: resetDemo,
  });

  const runIngestionFlow = useCallback(
    async (imageFile: File | undefined) => {
      if (processingLockRef.current) return;
      processingLockRef.current = true;
      clearRun();
      setPhase("processing");

      const started = Date.now();
      let nextClasses: ClassDossier[] = mockDossier.classes;
      let nextEvaluation: ScheduleEvaluation = mockDossier.evaluation;

      if (imageFile?.type.startsWith("image/")) {
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

          const [fitResult] = await Promise.all([
            analyzeFit(response.results).catch(() => null),
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
            };
          }
        } catch (err) {
          console.error("runIngestionFlow: researchScreenshot failed:", err);
        }
      }

      if (nextClasses === mockDossier.classes || !imageFile?.type.startsWith("image/")) {
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
      setPhase("dashboard");
      setIngestionCollapsed(true);

      const payload = buildPayloadFromClasses(
        mockDossier.activeQuarterId,
        nextClasses,
        [],
        nextEvaluation,
      );
      await persistCompletedSession(payload);
    },
    [clearRun, persistCompletedSession],
  );

  const handleFilesSelected = useCallback(
    (files: FileList | File[]) => {
      const imageFile = Array.from(files).find((f) => f.type.startsWith("image/"));
      void runIngestionFlow(imageFile);
    },
    [runIngestionFlow],
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
        <RightSidebar
          planSectionTitle={authed ? "Saved plans" : "My Quarters"}
          plans={sidebarPlans}
          activePlanId={activePlanId}
          onSelectPlan={(id) => { setActivePlanId(id); setPhase("dashboard"); }}
          newPlanLabel={authed ? "New saved plan" : "New quarter research"}
          onNewPlan={authed ? handleNewPlan : undefined}
          onDeletePlan={authed ? handleDeletePlan : undefined}
          vaultItems={sidebarVault}
          vaultSynced={authed}
        />
        <main
          className={`relative min-w-0 flex-1 overflow-y-auto py-4 pb-10 ${
            phase === "dashboard" ? "px-4 lg:pl-3 lg:pr-8" : "px-4 lg:px-6"
          }`}
        >
          <div
            className={`mx-auto w-full ${phase === "dashboard" ? "max-w-[min(100%,1760px)]" : "max-w-5xl"} ${phase === "processing" ? "pointer-events-none blur-[2px]" : ""}`}
          >
            <nav
              className="mb-4 flex flex-wrap items-center gap-1 text-xs text-hub-text-muted"
              aria-label="Breadcrumb"
            >
              <span>Schedules</span>
              <ChevronRight className="h-3 w-3" aria-hidden />
              <span className="font-medium text-hub-text-secondary">{quarterLabel}</span>
              {phase === "dashboard" ? (
                <>
                  <ChevronRight className="h-3 w-3" aria-hidden />
                  <span className="text-hub-cyan">Courses</span>
                </>
              ) : null}
            </nav>

            <AnimatePresence mode="popLayout">
              {phase === "idle" ? (
                <motion.div
                  key="idle-layout"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8, transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] } }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="grid grid-cols-1 gap-8 lg:grid-cols-[5fr_3fr] lg:gap-14"
                >
                  {/* ── Left: Problem statement + action ── */}
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
                        className="mt-5 max-w-[520px] text-[15px] leading-[1.68] text-hub-text-secondary"
                      >
                        Upload your WebReg screenshot. Get professor ratings, grade distributions, Reddit posts, and a workload estimate for every class, before you finalize anything.
                      </motion.p>
                    </div>

                    <IngestionHub
                      phase={phase}
                      collapsed={ingestionCollapsed}
                      onToggleCollapse={() => setIngestionCollapsed((c) => !c)}
                      onFilesSelected={handleFilesSelected}
                      onManualSubmit={handleManualSubmit}
                      classCount={classCount}
                      quarterLabel={quarterLabel}
                    />
                  </div>

                  {/* ── Right: Result story — sample output → feature list ── */}
                  <div className="flex flex-col gap-4 lg:pt-1">

                    {/* Context label: tells first-time viewers what the card represents */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.35, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="flex items-center gap-2.5"
                    >
                      <span className="h-px flex-1 bg-white/[0.06]" />
                    </motion.div>

                    <IdlePreviewCard />

                    {/* Separator */}
                    <div className="h-px bg-white/[0.05]" />

                    {/* What you get label */}
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.35, delay: 0.38, ease: [0.22, 1, 0.36, 1] }}
                      className="text-[10px] font-bold uppercase tracking-[0.18em] text-hub-cyan"
                    >
                      What you get
                    </motion.p>

                    {/* Feature chips — 2 columns, scoped to this panel */}
                    <div className="grid grid-cols-2 gap-1.5">
                      {WHAT_YOU_GET.map((item, i) => (
                        <motion.div
                          key={item.label}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.26, delay: 0.44 + i * 0.048, ease: [0.22, 1, 0.36, 1] }}
                          className="cursor-default rounded-lg border border-white/[0.06] bg-hub-surface/70 px-2.5 py-2.5 transition-colors duration-150 hover:border-white/[0.11] hover:bg-hub-surface"
                        >
                          <div className="mb-1 font-[family-name:var(--font-jetbrains-mono)] text-[9.5px] font-bold tabular-nums text-hub-cyan">
                            {String(i + 1).padStart(2, "0")}
                          </div>
                          <div className="text-[10px] font-semibold leading-snug text-hub-text">
                            {item.label}
                          </div>
                        </motion.div>
                      ))}
                    </div>
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
                  {viewClasses.length === 0 ? (
                    <p className="rounded-xl border border-white/[0.08] bg-hub-bg/40 px-4 py-8 text-center text-sm text-hub-text-muted">
                      No schedule data for this plan yet. Upload your schedule above or select another saved plan.
                    </p>
                  ) : (
                    <DossierScheduleWorkspace
                      viewClasses={viewClasses}
                      evaluation={viewEvaluation}
                      hydrateKey={`${activePlanId}:${authed}`}
                      scheduleItems={dossiersToScheduleItems(viewClasses)}
                      transitionInsights={[]}
                      initialCommitments={viewCommitments}
                      ref={workspaceRef}
                      calendarHeaderActions={(
                        <div className="flex items-center gap-2">
                          <SaveMenu
                            open={saveMenuOpen}
                            onToggle={() => setSaveMenuOpen((s) => !s)}
                            onOverwrite={() => void handleSaveOverwrite()}
                            onSaveAsNew={() => void handleSaveAsNew()}
                            onClose={() => setSaveMenuOpen(false)}
                          />
                        </div>
                      )}
                    />
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </main>

      </div>

      <ProcessingModal open={phase === "processing"} />
    </div>
  );
}
