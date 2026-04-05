"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  LayoutGrid,
  Maximize2,
  Plus,
  Redo2,
  RotateCcw,
  Undo2,
  X,
} from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { ClassCard } from "@/components/dashboard/ClassCard";
import { CampusPathMap } from "@/components/dashboard/CampusPathMap";
import { EvaluatorFooter } from "@/components/dashboard/EvaluatorFooter";
import { WeeklyCalendar, type CourseBlock, type CommitmentBlock, COL_TO_DAY, parseDaysToCols, removeDayFromString, minutesToTimeStr, minutesToTimeInput } from "@/components/dashboard/WeeklyCalendar";
import { useCalendarSyncHandler } from "@/components/layout/calendar-sync-context";
import { useCalendarState } from "@/components/layout/calendar-state-context";
import {
  useScheduleEditor,
  useScheduleFingerprint,
} from "@/hooks/useScheduleEditor";
import type { ClassDossier, ScheduleCommitment, ScheduleEvaluation, ScheduleItem, TransitionInsight } from "@/types/dossier";

const COMMITMENT_PRESETS = [
  { label: "Coral", value: "#f97316" },
  { label: "Rose", value: "#fb7185" },
  { label: "Violet", value: "#a78bfa" },
  { label: "Mint", value: "#34d399" },
  { label: "Sky", value: "#38bdf8" },
  { label: "Sand", value: "#e3b12f" },
];

function minutesFromTimeInput(iso: string): number | null {
  if (!iso) return null;
  const [hStr, mStr] = iso.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

type MainTab = "dossier" | "schedule";

type Props = {
  viewClasses: ClassDossier[];
  evaluation: ScheduleEvaluation;
  hydrateKey: string;
  scheduleItems?: ScheduleItem[];
  transitionInsights?: TransitionInsight[];
};

export function DossierScheduleWorkspace({
  viewClasses,
  evaluation,
  hydrateKey,
  scheduleItems = [],
  transitionInsights = [],
}: Props) {
  const fingerprint = useScheduleFingerprint(viewClasses);
  const fullKey = `${hydrateKey}|${fingerprint}`;

  const {
    classes,
    commitments,
    apply,
    undo,
    redo,
    resetToBaseline,
    addCommitment,
    removeCommitment,
    editCommitment,
    canUndo,
    canRedo,
    isDirty,
  } = useScheduleEditor(viewClasses, fullKey);

  const [mainTab, setMainTab] = useState<MainTab>("dossier");
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const formId = useId();

  const [newTitle, setNewTitle] = useState("Work");
  const [newDay, setNewDay] = useState(0);
  const [newStart, setNewStart] = useState("14:00");
  const [newEnd, setNewEnd] = useState("15:00");
  const [newColor, setNewColor] = useState(COMMITMENT_PRESETS[0].value);
  const [blockError, setBlockError] = useState<string | null>(null);

  const [editingBlock, setEditingBlock] = useState<CourseBlock | CommitmentBlock | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDay, setEditDay] = useState(0);
  const [editStart, setEditStart] = useState("08:00");
  const [editEnd, setEditEnd] = useState("09:00");
  const [editColor, setEditColor] = useState(COMMITMENT_PRESETS[0].value);
  const [editLocation, setEditLocation] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const onSyncCalendar = useCalendarSyncHandler();
  const { calendarVisible, reportCalendarVisible, registerOpenFullscreen, openCalendar } = useCalendarState();

  const calendarRef = useRef<HTMLDivElement>(null);

  // Register the fullscreen opener so the sidebar can trigger it
  useEffect(() => {
    registerOpenFullscreen(() => setFullscreenOpen(true));
  }, [registerOpenFullscreen]);

  // Track whether the calendar is in the viewport
  useEffect(() => {
    const el = calendarRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => reportCalendarVisible(entry.isIntersecting),
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reportCalendarVisible]);

  useEffect(() => {
    if (!addOpen && !fullscreenOpen && !editingBlock) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (addOpen) setAddOpen(false);
      else if (editingBlock) setEditingBlock(null);
      else setFullscreenOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addOpen, fullscreenOpen, editingBlock]);

  const openAddModal = useCallback(() => {
    setBlockError(null);
    setAddOpen(true);
  }, []);

  const openEditModal = useCallback((block: CourseBlock | CommitmentBlock) => {
    setEditError(null);
    if (block.kind === "commitment") {
      const c = block.commitment;
      setEditTitle(c.title);
      setEditDay(c.dayCol);
      setEditStart(minutesToTimeInput(c.startMin));
      setEditEnd(minutesToTimeInput(c.endMin));
      setEditColor(c.color);
    } else {
      setEditDay(block.col);
      setEditStart(minutesToTimeInput(block.startMin));
      setEditEnd(minutesToTimeInput(block.endMin));
      setEditLocation(block.meeting.location);
    }
    setEditingBlock(block);
  }, []);

  const submitEdit = useCallback(() => {
    if (!editingBlock) return;
    const s = minutesFromTimeInput(editStart);
    const e = minutesFromTimeInput(editEnd);
    if (s === null || e === null) {
      setEditError("Please enter valid start and end times.");
      return;
    }
    if (e <= s) {
      setEditError("End time must be after the start time.");
      return;
    }
    if (e - s > 8 * 60) {
      setEditError("Blocks longer than 8 hours aren't supported.");
      return;
    }
    setEditError(null);

    if (editingBlock.kind === "commitment") {
      editCommitment({
        ...editingBlock.commitment,
        title: editTitle.trim() || "Untitled",
        dayCol: editDay,
        startMin: s,
        endMin: e,
        color: editColor,
      });
    } else {
      // Course block: update the meeting (same logic as drag-drop)
      const newDayToken = COL_TO_DAY[editDay];
      const updatedClasses = classes.map((d) => {
        if (d.id !== editingBlock.dossierId) return d;
        const meetings = [...d.meetings];
        const orig = meetings[editingBlock.meetingIdx];
        const origCols = parseDaysToCols(orig.days);
        const updatedMeeting = {
          ...orig,
          days: newDayToken,
          start_time: minutesToTimeStr(s),
          end_time: minutesToTimeStr(e),
          location: editLocation,
        };
        if (origCols.length === 1) {
          meetings[editingBlock.meetingIdx] = updatedMeeting;
        } else {
          meetings[editingBlock.meetingIdx] = {
            ...orig,
            days: removeDayFromString(orig.days, editingBlock.col),
          };
          meetings.push(updatedMeeting);
        }
        return { ...d, meetings };
      });
      apply({ classes: updatedClasses, commitments });
    }
    setEditingBlock(null);
  }, [editingBlock, editStart, editEnd, editTitle, editDay, editColor, editLocation, editCommitment, apply, classes, commitments]);

  const submitCommitment = useCallback(() => {
    const s = minutesFromTimeInput(newStart);
    const e = minutesFromTimeInput(newEnd);
    if (s === null || e === null) {
      setBlockError("Please enter valid start and end times.");
      return;
    }
    if (e <= s) {
      setBlockError(
        "End time must be after the start time. Blocks can't span midnight — keep start and end on the same day.",
      );
      return;
    }
    if (e - s > 8 * 60) {
      setBlockError(
        "Blocks longer than 8 hours aren't supported. Consider splitting into multiple shorter blocks.",
      );
      return;
    }
    setBlockError(null);
    const c: ScheduleCommitment = {
      id: `commit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: newTitle.trim() || "Untitled",
      color: newColor,
      dayCol: newDay,
      startMin: s,
      endMin: e,
    };
    addCommitment(c);
    setAddOpen(false);
  }, [addCommitment, newColor, newDay, newEnd, newStart, newTitle]);

  const scheduleToolbar = useMemo(
    () => (
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] pb-3">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-white/[0.08] bg-hub-bg/40 p-0.5">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            title="Undo"
            className="rounded-md p-2 text-hub-text-muted transition hover:bg-hub-surface-elevated hover:text-hub-text disabled:pointer-events-none disabled:opacity-30"
          >
            <Undo2 className="h-4 w-4" aria-hidden />
            <span className="sr-only">Undo</span>
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            title="Redo"
            className="rounded-md p-2 text-hub-text-muted transition hover:bg-hub-surface-elevated hover:text-hub-text disabled:pointer-events-none disabled:opacity-30"
          >
            <Redo2 className="h-4 w-4" aria-hidden />
            <span className="sr-only">Redo</span>
          </button>
        </div>
        <button
          type="button"
          onClick={resetToBaseline}
          title="Restore meetings to the last ingested plan"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-hub-bg/35 px-3 py-2 text-xs font-medium text-hub-text-secondary transition hover:border-hub-cyan/30 hover:text-hub-text"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Original schedule
        </button>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center gap-1.5 rounded-lg border border-hub-cyan/35 bg-hub-cyan/10 px-3 py-2 text-xs font-medium text-hub-cyan transition hover:bg-hub-cyan/15"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add block
        </button>
        {isDirty ? (
          <span className="w-full basis-full text-[10px] text-hub-text-muted lg:basis-auto">
            Unsaved local edits — use Original schedule to discard all moves.
          </span>
        ) : null}
      </div>
    ),
    [
      canRedo,
      canUndo,
      isDirty,
      openAddModal,
      redo,
      resetToBaseline,
      undo,
    ],
  );

  const calendarHeaderActions = useMemo(
    () => (
      <>
        <button
          type="button"
          onClick={onSyncCalendar}
          className="inline-flex items-center gap-1.5 rounded-lg border border-hub-cyan/35 bg-hub-cyan/10 px-2.5 py-1.5 text-[11px] font-semibold text-hub-cyan transition hover:bg-hub-cyan/18"
        >
          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="hidden sm:inline">Sync to Google Calendar</span>
          <span className="sm:hidden">Sync</span>
        </button>
        <button
          type="button"
          onClick={() => setFullscreenOpen(true)}
          title="Expand schedule to full screen"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-hub-bg/55 px-2.5 py-1.5 text-[11px] font-medium text-hub-text-secondary transition hover:border-hub-cyan/25 hover:text-hub-text"
        >
          <Maximize2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="hidden sm:inline">Full screen</span>
        </button>
      </>
    ),
    [onSyncCalendar],
  );

  const calendarNode = (px: number, calHeader: ReactNode | null) => (
    <div className="flex flex-col space-y-3">
      {scheduleToolbar}
      <div className="lg:min-h-[min(520px,calc(100vh-14rem))]">
        <WeeklyCalendar
          classes={classes}
          commitments={commitments}
          onApply={apply}
          pxPerHour={px}
          headerActions={calHeader ?? undefined}
          hideScheduleHeading={calHeader === null}
          onBlockDoubleClick={openEditModal}
        />
      </div>
      {commitments.length > 0 ? (
        <div className="rounded-lg border border-white/[0.06] bg-hub-bg/25 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-hub-text-muted">
            Your blocks
          </p>
          <ul className="mt-2 space-y-1.5">
            {commitments.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 text-xs text-hub-text-secondary"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="truncate font-medium text-hub-text">
                    {c.title}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeCommitment(c.id)}
                  className="shrink-0 rounded px-2 py-0.5 text-[10px] text-hub-text-muted hover:bg-white/5 hover:text-hub-danger"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );

  const fullscreenSyncBtn = (
    <button
      type="button"
      onClick={onSyncCalendar}
      className="inline-flex items-center gap-2 rounded-lg border border-hub-cyan/35 bg-hub-cyan/12 px-3 py-2 text-xs font-semibold text-hub-cyan transition hover:bg-hub-cyan/20"
    >
      <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
      Sync to Google Calendar
    </button>
  );

  return (
    <>
      {/* Mobile / tablet: primary tab switcher */}
      <div className="mb-4 flex lg:hidden">
        <div className="flex w-full rounded-xl border border-white/[0.08] bg-hub-bg/40 p-1">
          <button
            type="button"
            onClick={() => setMainTab("dossier")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition ${
              mainTab === "dossier"
                ? "bg-hub-surface-elevated text-hub-text shadow-sm"
                : "text-hub-text-muted hover:text-hub-text-secondary"
            }`}
          >
            <LayoutGrid className="h-4 w-4 opacity-70" aria-hidden />
            Courses
          </button>
          <button
            type="button"
            onClick={() => setMainTab("schedule")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition ${
              mainTab === "schedule"
                ? "bg-hub-surface-elevated text-hub-text shadow-sm"
                : "text-hub-text-muted hover:text-hub-text-secondary"
            }`}
          >
            Schedule
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-col gap-6">
        {/* Calendar on top */}
        <div
          ref={calendarRef}
          className={mainTab === "dossier" ? "hidden lg:block" : ""}
        >
          {calendarNode(78, calendarHeaderActions)}
        </div>

        {/* Dossier cards below */}
        <div
          className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${
            mainTab === "schedule" ? "hidden lg:grid" : ""
          }`}
        >
          {classes.map((c) => (
            <ClassCard key={c.id} dossier={c} />
          ))}
        </div>
        {scheduleItems.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className={mainTab === "schedule" ? "hidden lg:block" : ""}
          >
            <CampusPathMap
              scheduleItems={scheduleItems}
              transitionInsights={transitionInsights}
            />
          </motion.div>
        ) : null}

        <div className={mainTab === "schedule" ? "hidden lg:block" : ""}>
          <EvaluatorFooter evaluation={evaluation} />
        </div>
      </div>

      <AnimatePresence>
        {fullscreenOpen ? (
          <motion.div
            key="fs-cal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex flex-col bg-[color-mix(in_srgb,var(--hub-bg)_96%,transparent)] p-4 backdrop-blur-md md:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Full screen schedule"
            onClick={() => setFullscreenOpen(false)}
          >
            <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
                <div className="min-w-0">
                  <p className="font-[family-name:var(--font-outfit)] text-base font-semibold tracking-tight text-hub-text">
                    Weekly schedule
                  </p>
                  <p className="text-[11px] text-hub-text-muted">
                    Full view · drag blocks to rearrange
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {fullscreenSyncBtn}
                  <button
                    type="button"
                    onClick={() => setFullscreenOpen(false)}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/[0.12] bg-hub-bg/50 px-3 py-2 text-xs font-medium text-hub-text-secondary transition hover:border-white/20 hover:text-hub-text"
                  >
                    <X className="h-4 w-4" aria-hidden />
                    Exit full screen
                  </button>
                </div>
              </div>
              {scheduleToolbar}
              <div className="min-h-0 flex-1 overflow-auto rounded-xl">
                <WeeklyCalendar
                  classes={classes}
                  commitments={commitments}
                  onApply={apply}
                  pxPerHour={96}
                  hideScheduleHeading
                  onBlockDoubleClick={openEditModal}
                />
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {!calendarVisible && !fullscreenOpen ? (
          <motion.button
            key="view-cal-fab"
            type="button"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
            onClick={openCalendar}
            className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-hub-cyan/40 bg-hub-surface/90 px-4 py-2.5 text-xs font-semibold text-hub-cyan shadow-lg backdrop-blur-sm transition hover:bg-hub-cyan/10"
          >
            <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
            View Calendar
          </motion.button>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {addOpen ? (
          <motion.div
            key="add-commit"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${formId}-title`}
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-hub-surface p-5 shadow-2xl shadow-black/40"
            >
              <div className="flex items-start justify-between gap-3">
                <h2
                  id={`${formId}-title`}
                  className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-hub-text"
                >
                  Add personal block
                </h2>
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="rounded-lg p-1.5 text-hub-text-muted hover:bg-white/5 hover:text-hub-text"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 text-xs text-hub-text-muted">
                Work, gym, clubs — appears on the grid with your courses.
              </p>
              <p className="mt-1 text-xs text-hub-text-muted">
                Blocks must start and end within the same day — midnight-spanning entries are not supported.
              </p>

              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">
                    Title
                  </span>
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-hub-bg/60 px-3 py-2 text-sm text-hub-text outline-none ring-hub-cyan/30 placeholder:text-hub-text-muted focus:ring-2"
                    placeholder="e.g. Work shift"
                  />
                </label>

                <label className="block">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">
                    Day
                  </span>
                  <select
                    value={newDay}
                    onChange={(e) => setNewDay(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-hub-bg/60 px-3 py-2 text-sm text-hub-text outline-none focus:ring-2 focus:ring-hub-cyan/30"
                  >
                    {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map(
                      (d, i) => (
                        <option key={d} value={i}>
                          {d}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">
                      Start
                    </span>
                    <input
                      type="time"
                      value={newStart}
                      onChange={(e) => setNewStart(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-hub-bg/60 px-3 py-2 text-sm text-hub-text outline-none focus:ring-2 focus:ring-hub-cyan/30"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">
                      End
                    </span>
                    <input
                      type="time"
                      value={newEnd}
                      onChange={(e) => setNewEnd(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-hub-bg/60 px-3 py-2 text-sm text-hub-text outline-none focus:ring-2 focus:ring-hub-cyan/30"
                    />
                  </label>
                </div>

                {blockError && (
                  <Alert variant={blockError.includes("longer than") ? "warn" : "error"}>
                    {blockError}
                  </Alert>
                )}

                <div>
                  <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">
                    Color
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {COMMITMENT_PRESETS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setNewColor(p.value)}
                        title={p.label}
                        className={`h-8 w-8 rounded-full border-2 transition ${
                          newColor === p.value
                            ? "scale-110 border-white"
                            : "border-transparent hover:border-white/30"
                        }`}
                        style={{ backgroundColor: p.value }}
                      />
                    ))}
                  </div>
                  <div className="mt-4">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">
                      Custom hue
                    </span>
                    <label className="mt-2 block cursor-pointer">
                      <span className="sr-only">Pick a custom color</span>
                      <div className="relative mt-1.5 h-11 w-full overflow-hidden rounded-lg border border-white/[0.14] bg-hub-bg/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                        <input
                          type="color"
                          value={newColor}
                          onChange={(e) => setNewColor(e.target.value)}
                          className="absolute inset-0 h-full min-h-[3rem] w-full cursor-pointer border-0 bg-transparent p-0 [appearance:none] [-webkit-appearance:none] [&::-webkit-color-swatch-wrapper]:border-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-moz-color-swatch]:rounded-md [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-md"
                          aria-label="Custom color hue picker"
                        />
                      </div>
                      <p className="mt-2 text-center font-[family-name:var(--font-jetbrains-mono)] text-[11px] tracking-wide text-hub-text-muted">
                        {newColor.toUpperCase()}
                      </p>
                    </label>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-hub-text-muted hover:bg-white/5 hover:text-hub-text"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitCommitment}
                  className="rounded-lg bg-hub-cyan/20 px-4 py-2 text-sm font-semibold text-hub-cyan ring-1 ring-hub-cyan/40 hover:bg-hub-cyan/25"
                >
                  Add to grid
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Edit block modal */}
      <AnimatePresence>
        {editingBlock ? (
          <motion.div
            key="edit-block"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-label={editingBlock.kind === "commitment" ? "Edit personal block" : "Edit course meeting"}
            onClick={() => setEditingBlock(null)}
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-hub-surface p-5 shadow-2xl shadow-black/40"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-hub-text">
                  {editingBlock.kind === "commitment" ? "Edit block" : `Edit ${editingBlock.courseCode}`}
                </h2>
                <button
                  type="button"
                  onClick={() => setEditingBlock(null)}
                  className="rounded-lg p-1.5 text-hub-text-muted hover:bg-white/5 hover:text-hub-text"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 space-y-4">
                {editingBlock.kind === "commitment" && (
                  <label className="block">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">
                      Title
                    </span>
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-hub-bg/60 px-3 py-2 text-sm text-hub-text outline-none ring-hub-cyan/30 placeholder:text-hub-text-muted focus:ring-2"
                    />
                  </label>
                )}

                <label className="block">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">
                    Day
                  </span>
                  <select
                    value={editDay}
                    onChange={(e) => setEditDay(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-hub-bg/60 px-3 py-2 text-sm text-hub-text outline-none focus:ring-2 focus:ring-hub-cyan/30"
                  >
                    {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((d, i) => (
                      <option key={d} value={i}>{d}</option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">
                      Start
                    </span>
                    <input
                      type="time"
                      value={editStart}
                      onChange={(e) => setEditStart(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-hub-bg/60 px-3 py-2 text-sm text-hub-text outline-none focus:ring-2 focus:ring-hub-cyan/30"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">
                      End
                    </span>
                    <input
                      type="time"
                      value={editEnd}
                      onChange={(e) => setEditEnd(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-hub-bg/60 px-3 py-2 text-sm text-hub-text outline-none focus:ring-2 focus:ring-hub-cyan/30"
                    />
                  </label>
                </div>

                {editingBlock.kind === "course" && (
                  <label className="block">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">
                      Location
                    </span>
                    <input
                      value={editLocation}
                      onChange={(e) => setEditLocation(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-hub-bg/60 px-3 py-2 text-sm text-hub-text outline-none ring-hub-cyan/30 placeholder:text-hub-text-muted focus:ring-2"
                      placeholder="e.g. CSB 001"
                    />
                  </label>
                )}

                {editingBlock.kind === "commitment" && (
                  <div>
                    <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">
                      Color
                    </span>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {COMMITMENT_PRESETS.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setEditColor(p.value)}
                          title={p.label}
                          className={`h-8 w-8 rounded-full border-2 transition ${
                            editColor === p.value
                              ? "scale-110 border-white"
                              : "border-transparent hover:border-white/30"
                          }`}
                          style={{ backgroundColor: p.value }}
                        />
                      ))}
                    </div>
                    <div className="mt-3 relative h-10 w-full overflow-hidden rounded-lg border border-white/[0.14] bg-hub-bg/50">
                      <input
                        type="color"
                        value={editColor}
                        onChange={(e) => setEditColor(e.target.value)}
                        className="absolute inset-0 h-full min-h-[3rem] w-full cursor-pointer border-0 bg-transparent p-0 [appearance:none] [-webkit-appearance:none] [&::-webkit-color-swatch-wrapper]:border-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-moz-color-swatch]:rounded-md [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-md"
                        aria-label="Custom color hue picker"
                      />
                    </div>
                  </div>
                )}

                {editError && (
                  <Alert variant="error">{editError}</Alert>
                )}
              </div>

              <div className="mt-6 flex items-center justify-between gap-2">
                {editingBlock.kind === "commitment" ? (
                  <button
                    type="button"
                    onClick={() => { removeCommitment(editingBlock.commitment.id); setEditingBlock(null); }}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-hub-danger hover:bg-hub-danger/10"
                  >
                    Delete
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingBlock(null)}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-hub-text-muted hover:bg-white/5 hover:text-hub-text"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitEdit}
                    className="rounded-lg bg-hub-cyan/20 px-4 py-2 text-sm font-semibold text-hub-cyan ring-1 ring-hub-cyan/40 hover:bg-hub-cyan/25"
                  >
                    Save
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
