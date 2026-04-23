"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, CalendarDays, LayoutGrid, Maximize2, Map as MapIcon, BarChart2, Layers, Minimize2, Users, X } from "lucide-react";
import { isExamSection } from "@/lib/mappers/dossiersToScheduleItems";
import { CourseJourneyPage } from "@/components/dashboard/DossierDashboardModal";
import { CampusPathMap } from "@/components/dashboard/CampusPathMap";
import { DifficultyScoreHud } from "@/components/dashboard/DifficultyScoreHud";
import { ExamsPanel } from "@/components/dashboard/ExamsPanel";
import { ScheduleToolbar } from "@/components/dashboard/ScheduleToolbar";
import { CommitmentsPanel } from "@/components/dashboard/CommitmentsPanel";
import { AddCommitmentModal } from "@/components/dashboard/modals/AddCommitmentModal";
import { ScheduledPostsOverlay } from "@/components/dashboard/ScheduledPostsOverlay";
import { EditBlockModal } from "@/components/dashboard/modals/EditBlockModal";
import { COMMITMENT_PRESETS } from "@/components/dashboard/commitmentPresets";
import { WeeklyCalendar, type CourseBlock, type CommitmentBlock, COL_TO_DAY, parseDaysToCols, removeDayFromString, minutesToTimeStr, minutesToTimeInput } from "@/components/dashboard/WeeklyCalendar";
import { useCalendarSyncHandler } from "@/components/layout/calendar-sync-context";
import { useCalendarState } from "@/components/layout/calendar-state-context";
import { useScheduleEditor } from "@/hooks/useScheduleEditor";
import type { ClassDossier, DossierEditPatch, ScheduleCommitment, ScheduleEvaluation, ScheduleItem, TransitionInsight, TransitProfile } from "@/types/dossier";

function isDossierRemoteOnly(dossier: ClassDossier): boolean {
  const regular = dossier.meetings.filter((m) => !isExamSection(m.section_type));
  return regular.length > 0 && regular.every((m) => m.geocode_status === "remote");
}

function buildDossierMarkerMap(
  scheduleItems: ScheduleItem[],
  classes: ClassDossier[],
): Map<string, number> {
  const result = new Map<string, number>();
  let counter = 1;
  for (const dossier of classes) {
    if (isDossierRemoteOnly(dossier)) continue;
    if (scheduleItems.some((item) => item.id.startsWith(dossier.id + "-"))) {
      result.set(dossier.id, counter++);
    }
  }
  return result;
}

function minutesFromTimeInput(iso: string): number | null {
  if (!iso) return null;
  const [hStr, mStr] = iso.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function haversineDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type WalkAdvisory = { key: string; message: string };

function parseMinutesFromAmPm(t: string): number | null {
  const m = t.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const period = m[3].toUpperCase();
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

function computeWalkAdvisories(classes: ClassDossier[]): WalkAdvisory[] {
  // Collect all meetings with resolved lat/lng and a parseable end_time
  type MeetingInfo = {
    courseCode: string;
    locationName: string;
    day: string;
    startMin: number;
    endMin: number;
    lat: number;
    lng: number;
  };
  const meetings: MeetingInfo[] = [];
  for (const c of classes) {
    for (const m of c.meetings) {
      if (!m.lat || !m.lng || m.geocode_status === "unresolved") continue;
      const start = parseMinutesFromAmPm(m.start_time);
      const end = parseMinutesFromAmPm(m.end_time);
      if (start === null || end === null) continue;
      // Flatten by day so we can sort per-day
      const parsedDays: string[] = [];
      let i = 0;
      while (i < m.days.length) {
        if (i + 1 < m.days.length && ["Tu", "Th", "Sa", "Su"].includes(m.days.slice(i, i + 2))) {
          parsedDays.push(m.days.slice(i, i + 2));
          i += 2;
        } else {
          parsedDays.push(m.days[i]);
          i += 1;
        }
      }
      for (const day of parsedDays) {
        meetings.push({
          courseCode: c.courseCode,
          locationName: m.location ?? m.building_code ?? "Unknown",
          day,
          startMin: start,
          endMin: end,
          lat: m.lat,
          lng: m.lng,
        });
      }
    }
  }

  // Group by day, sort by start time, check back-to-back gaps
  const byDay = new Map<string, MeetingInfo[]>();
  for (const m of meetings) {
    const list = byDay.get(m.day) ?? [];
    list.push(m);
    byDay.set(m.day, list);
  }

  const advisories: WalkAdvisory[] = [];
  for (const list of byDay.values()) {
    list.sort((a, b) => a.startMin - b.startMin);
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      // Only flag if gap between classes is ≤ 20 minutes (potentially tight)
      const gapMin = b.startMin - a.endMin;
      if (gapMin > 20) continue;
      const dist = haversineDistanceMiles(a.lat, a.lng, b.lat, b.lng);
      if (dist > 0.5) {
        advisories.push({
          key: `${a.courseCode}-${b.courseCode}-${a.day}`,
          message: `Logistics Note: ${a.locationName} → ${b.locationName} (${dist.toFixed(1)} mi, ${gapMin} min gap). Verify if attendance is mandatory or tardiness is acceptable.`,
        });
      }
    }
  }
  return advisories;
}

type MainTab = "dossier" | "schedule";
type WorkspacePhase = "overview" | "logistics" | "review" | `course:${string}`;

function coursePhaseId(dossierId: string): `course:${string}` {
  return `course:${dossierId}`;
}

function isCoursePhase(phase: WorkspacePhase): phase is `course:${string}` {
  return phase.startsWith("course:");
}

export type DossierScheduleWorkspaceHandle = {
  getCurrentClasses: () => ClassDossier[];
  getCurrentCommitments: () => ScheduleCommitment[];
  getCurrentCourseLabels: () => Record<string, string>;
  /** Promote current editor state to baseline so isDirty resets to false after a successful save. */
  commit: () => void;
  isDirty: boolean;
  hasDossierEdits: boolean;
};

type Props = {
  viewClasses: ClassDossier[];
  evaluation: ScheduleEvaluation;
  hydrateKey: string;
  /** Incremented only on explicit plan switches (not saves). Drives the phase/tab reset. */
  planSwitchKey?: number;
  calendarSyncTitle?: string;
  scheduleItems?: ScheduleItem[];
  transitionInsights?: TransitionInsight[];
  calendarHeaderActions?: ReactNode;
  initialCommitments?: ScheduleCommitment[];
  initialCourseLabels?: Record<string, string>;
  // Save flow
  onSave?: () => Promise<void>;
  isSaving?: boolean;
  lastSavedAt?: Date | null;
  saveError?: string | null;
  showSavePrompt?: boolean;
  onSavePromptDismiss?: () => void;
  // Personalization
  transitProfile?: TransitProfile;
};

function formatSaveTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export const DossierScheduleWorkspace = forwardRef(function DossierScheduleWorkspace(
  {
    viewClasses,
    evaluation,
    hydrateKey,
    planSwitchKey,
    calendarSyncTitle,
    scheduleItems = [],
    transitionInsights = [],
    calendarHeaderActions,
    initialCommitments = [],
    initialCourseLabels = {},
    onSave,
    isSaving = false,
    lastSavedAt,
    saveError,
    showSavePrompt = false,
    onSavePromptDismiss,
    transitProfile,
  }: Props,
  ref: React.Ref<DossierScheduleWorkspaceHandle | null>,
) {
  // hydrateKey (= "${activePlanId}:${authed}") is the sole trigger for re-hydration.
  // We intentionally do NOT append a fingerprint here — viewClasses changes after a save
  // (usePlanSync refreshes remotePlans) must NOT wipe the editor state.
  // For v2 plans the workspace is unmounted during loading, so fresh-mount initialisation
  // from useReducer's initialiser function handles the "data just arrived" case correctly.
  const {
    classes, commitments, courseLabels, apply, commit, undo, redo, resetToBaseline,
    addCommitment, removeCommitment, editCommitment,
    canUndo, canRedo, isDirty,
  } = useScheduleEditor(viewClasses, hydrateKey, initialCommitments, initialCourseLabels);

  const [hasDossierEdits, setHasDossierEdits] = useState(false);

  // Reset dossier-edit flag when the plan changes (new hydrateKey = new plan loaded)
  useEffect(() => {
    setHasDossierEdits(false);
  }, [hydrateKey]);

  useImperativeHandle(ref, () => ({
    getCurrentClasses: () => classes,
    getCurrentCommitments: () => commitments,
    getCurrentCourseLabels: () => courseLabels,
    commit: () => {
      commit();
      setHasDossierEdits(false);
    },
    isDirty,
    hasDossierEdits,
  }), [classes, commitments, courseLabels, commit, isDirty, hasDossierEdits]);

  /** Apply a user-supplied correction to a dossier field. Held in editor state until plan is saved. */
  const onUpdateDossier = useCallback((dossierId: string, patch: DossierEditPatch) => {
    const updatedClasses = classes.map((c): ClassDossier => {
      if (c.id !== dossierId) return c;
      return {
        ...c,
        ...(patch.courseTitle != null ? { courseTitle: patch.courseTitle } : {}),
        ...(patch.professorName != null ? { professorName: patch.professorName } : {}),
        ...(patch.logistics != null
          ? { logistics: c.logistics ? { ...c.logistics, ...patch.logistics } : (patch.logistics as ClassDossier["logistics"]) }
          : {}),
      };
    });
    setHasDossierEdits(true);
    apply({ classes: updatedClasses, commitments, courseLabels });
  }, [apply, classes, commitments, courseLabels]);

  const [mainTab, setMainTab] = useState<MainTab>("dossier");
  const [currentPhase, setCurrentPhase] = useState<WorkspacePhase>("overview");
  const firstCoursePhase = classes[0] ? coursePhaseId(classes[0].id) : "overview";
  const openFirstCourse = useCallback(() => setCurrentPhase(firstCoursePhase), [firstCoursePhase]);

  // Reset UI state only on intentional plan switches (planSwitchKey), NOT on saves.
  // Saving a new plan changes hydrateKey (new activePlanId) but must not yank the user
  // off the current tab — only an explicit plan swap should land back on Overview.
  useEffect(() => {
    setCurrentPhase("overview");
    setMainTab("dossier");
  }, [planSwitchKey]);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [communityOverlayOpen, setCommunityOverlayOpen] = useState(false);
  const [calendarExportPromptOpen, setCalendarExportPromptOpen] = useState(false);
  const [includeExamTimesInExport, setIncludeExamTimesInExport] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const formId = useId();

  type PendingRename =
    | { kind: "course"; labelKey: string; oldName: string; newName: string; otherCount: number }
    | { kind: "commitment"; oldTitle: string; newName: string; otherCount: number };
  const [pendingRename, setPendingRename] = useState<PendingRename | null>(null);

  // Add-block form state
  const [newTitle, setNewTitle] = useState("Work");
  const [newDay, setNewDay] = useState(0);
  const [newStart, setNewStart] = useState("14:00");
  const [newEnd, setNewEnd] = useState("15:00");
  const [newColor, setNewColor] = useState<string>(COMMITMENT_PRESETS[0].value);
  const [blockError, setBlockError] = useState<string | null>(null);

  // Edit-block form state
  const [editingBlock, setEditingBlock] = useState<CourseBlock | CommitmentBlock | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDay, setEditDay] = useState(0);
  const [editStart, setEditStart] = useState("08:00");
  const [editEnd, setEditEnd] = useState("09:00");
  const [editColor, setEditColor] = useState<string>(COMMITMENT_PRESETS[0].value);
  const [editLocation, setEditLocation] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const onSyncCalendar = useCalendarSyncHandler();
  const { calendarVisible, reportCalendarVisible, registerOpenFullscreen, openCalendar } = useCalendarState();
  const calendarRef = useRef<HTMLDivElement>(null);
  const dossierMarkerMap = useMemo(() => buildDossierMarkerMap(scheduleItems, classes), [scheduleItems, classes]);
  const walkAdvisories = useMemo(
    () => (transitProfile === "walking" ? computeWalkAdvisories(classes) : []),
    [transitProfile, classes],
  );
  const workspaceTabs = useMemo(
    () => [
      { id: "overview" as WorkspacePhase, label: "Overview", icon: BarChart2 },
      ...classes.map((course) => ({
        id: coursePhaseId(course.id),
        label: course.courseCode,
        icon: BookOpen,
      })),
      { id: "logistics" as WorkspacePhase, label: "Logistics", icon: MapIcon },
      { id: "review" as WorkspacePhase, label: "Review", icon: Layers },
    ],
    [classes],
  );
  const activeCourse = useMemo(
    () =>
      isCoursePhase(currentPhase)
        ? classes.find((course) => coursePhaseId(course.id) === currentPhase) ?? null
        : null,
    [classes, currentPhase],
  );

  useEffect(() => {
    registerOpenFullscreen(() => setFullscreenOpen(true));
  }, [registerOpenFullscreen]);

  useEffect(() => {
    if (!isCoursePhase(currentPhase)) return;
    if (classes.some((course) => coursePhaseId(course.id) === currentPhase)) return;
    setCurrentPhase(firstCoursePhase);
  }, [classes, currentPhase, firstCoursePhase]);

  // Clear any stale course selection when entering the Logistics phase.
  // On this tab selection is only driven by map and schedule interactions.
  useEffect(() => {
    if (currentPhase === "logistics") setSelectedClassId(null);
  }, [currentPhase]);

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
    if (!addOpen && !fullscreenOpen && !editingBlock && !pendingRename && !calendarExportPromptOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (addOpen) setAddOpen(false);
      else if (editingBlock) setEditingBlock(null);
      else if (pendingRename) setPendingRename(null);
      else if (calendarExportPromptOpen) setCalendarExportPromptOpen(false);
      else setFullscreenOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addOpen, fullscreenOpen, editingBlock, pendingRename, calendarExportPromptOpen]);

  useEffect(() => {
    if (!fullscreenOpen) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [fullscreenOpen]);

  const openAddModal = useCallback(() => { setBlockError(null); setAddOpen(true); }, []);

  // "Just this one" for courses: apply the label override only to the single block that was edited.
  const confirmRenameSingle = useCallback(() => {
    if (!pendingRename || pendingRename.kind !== "course") { setPendingRename(null); return; }
    const nextLabels = { ...courseLabels, [pendingRename.labelKey]: pendingRename.newName };
    apply({ classes, commitments, courseLabels: nextLabels });
    setPendingRename(null);
  }, [pendingRename, courseLabels, apply, classes, commitments]);

  // "Rename all": set the label override on every meeting entry that currently shows the old name.
  const confirmRenameAll = useCallback(() => {
    if (!pendingRename) return;
    if (pendingRename.kind === "course") {
      const nextLabels = { ...courseLabels };
      for (const d of classes) {
        d.meetings.forEach((_, idx) => {
          const key = `${d.id}:${idx}`;
          if ((courseLabels[key] ?? d.courseCode) === pendingRename.oldName) {
            nextLabels[key] = pendingRename.newName;
          }
        });
      }
      apply({ classes, commitments, courseLabels: nextLabels });
    } else {
      const updated = commitments.map((c) =>
        c.title === pendingRename.oldTitle ? { ...c, title: pendingRename.newName } : c
      );
      apply({ classes, commitments: updated, courseLabels });
    }
    setPendingRename(null);
  }, [pendingRename, courseLabels, apply, classes, commitments]);

  const deleteMeeting = useCallback((block: CourseBlock) => {
    const updatedClasses = classes.map((d) => {
      if (d.id !== block.dossierId) return d;
      return { ...d, meetings: d.meetings.filter((_, idx) => idx !== block.meetingIdx) };
    });
    apply({ classes: updatedClasses, commitments, courseLabels });
    setEditingBlock(null);
  }, [apply, classes, commitments, courseLabels]);

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
      setEditTitle(block.label);
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
    if (s === null || e === null) { setEditError("Please enter valid start and end times."); return; }
    if (e <= s) { setEditError("End time must be after the start time."); return; }
    if (e - s > 8 * 60) { setEditError("Blocks longer than 8 hours aren't supported."); return; }
    setEditError(null);

    if (editingBlock.kind === "commitment") {
      const oldTitle = editingBlock.commitment.title;
      const newTitle = editTitle.trim() || "Untitled";
      editCommitment({ ...editingBlock.commitment, title: newTitle, dayCol: editDay, startMin: s, endMin: e, color: editColor });
      if (newTitle !== oldTitle) {
        const otherCount = commitments.filter(
          (c) => c.id !== editingBlock.commitment.id && c.title === oldTitle
        ).length;
        if (otherCount > 0) setPendingRename({ kind: "commitment", oldTitle, newName: newTitle, otherCount });
      }
    } else {
      const labelKey = `${editingBlock.dossierId}:${editingBlock.meetingIdx}`;
      const currentLabel = courseLabels[labelKey] ?? editingBlock.courseCode;
      const newDayToken = COL_TO_DAY[editDay];
      const newLabel = editTitle.trim();
      const labelChanged = !!newLabel && newLabel !== currentLabel;

      // Build structural changes (time/day/location) only — never mutate ClassDossier.courseCode.
      const updatedClassesStructural = classes.map((d) => {
        if (d.id !== editingBlock.dossierId) return d;
        const meetings = [...d.meetings];
        const orig = meetings[editingBlock.meetingIdx];
        const origCols = parseDaysToCols(orig.days);
        const updatedMeeting = { ...orig, days: newDayToken, start_time: minutesToTimeStr(s), end_time: minutesToTimeStr(e), location: editLocation };
        if (origCols.length === 1) {
          meetings[editingBlock.meetingIdx] = updatedMeeting;
        } else {
          meetings[editingBlock.meetingIdx] = { ...orig, days: removeDayFromString(orig.days, editingBlock.col) };
          meetings.push(updatedMeeting);
        }
        return { ...d, meetings };
      });

      if (labelChanged) {
        // Count all OTHER dossierId:meetingIdx entries whose current effective label matches.
        const otherCount = classes.reduce((sum, d) => {
          return sum + d.meetings.filter((_, idx) => {
            if (d.id === editingBlock.dossierId && idx === editingBlock.meetingIdx) return false;
            return (courseLabels[`${d.id}:${idx}`] ?? d.courseCode) === currentLabel;
          }).length;
        }, 0);

        if (otherCount > 0) {
          // Apply structural changes; defer label change to confirmation popup.
          apply({ classes: updatedClassesStructural, commitments, courseLabels });
          setPendingRename({ kind: "course", labelKey, oldName: currentLabel, newName: newLabel, otherCount });
        } else {
          // Only this entry has the label — apply override directly, no popup.
          const nextLabels = { ...courseLabels, [labelKey]: newLabel };
          apply({ classes: updatedClassesStructural, commitments, courseLabels: nextLabels });
        }
      } else {
        apply({ classes: updatedClassesStructural, commitments, courseLabels });
      }
    }
    setEditingBlock(null);
  }, [editingBlock, editStart, editEnd, editTitle, editDay, editColor, editLocation, editCommitment, apply, classes, commitments, courseLabels]);

  const submitCommitment = useCallback(() => {
    const s = minutesFromTimeInput(newStart);
    const e = minutesFromTimeInput(newEnd);
    if (s === null || e === null) { setBlockError("Please enter valid start and end times."); return; }
    if (e <= s) { setBlockError("End time must be after the start time. Blocks can't span midnight — keep start and end on the same day."); return; }
    if (e - s > 8 * 60) { setBlockError("Blocks longer than 8 hours aren't supported. Consider splitting into multiple shorter blocks."); return; }
    setBlockError(null);
    addCommitment({
      id: `commit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: newTitle.trim() || "Untitled",
      color: newColor,
      dayCol: newDay,
      startMin: s,
      endMin: e,
    });
    setAddOpen(false);
  }, [addCommitment, newColor, newDay, newEnd, newStart, newTitle]);

  // Preserves courseLabels when WeeklyCalendar drag-drop fires onApply with only classes+commitments.
  const applyKeepingLabels = useCallback(
    (next: { classes: ClassDossier[]; commitments: ScheduleCommitment[] }) => {
      apply({ ...next, courseLabels });
    },
    [apply, courseLabels],
  );

  const submitCalendarExport = useCallback(() => {
    void onSyncCalendar({
      classes,
      commitments,
      courseLabels,
      scheduleTitle: calendarSyncTitle,
      includeExamTimes: includeExamTimesInExport,
    });
    setCalendarExportPromptOpen(false);
  }, [onSyncCalendar, classes, commitments, courseLabels, calendarSyncTitle, includeExamTimesInExport]);

  const syncBtn = (size: "sm" | "lg") => (
    <button
      type="button"
      onClick={() => setCalendarExportPromptOpen(true)}
      className={
        size === "lg"
          ? "inline-flex items-center gap-2 rounded-lg border border-hub-cyan/35 bg-hub-cyan/12 px-3 py-2 text-xs font-semibold text-hub-cyan transition hover:bg-hub-cyan/20"
          : "inline-flex items-center gap-1.5 rounded-lg border border-hub-cyan/35 bg-hub-cyan/10 px-2.5 py-1.5 text-[11px] font-semibold text-hub-cyan transition hover:bg-hub-cyan/18"
      }
    >
      <CalendarDays className={size === "lg" ? "h-4 w-4 shrink-0" : "h-3.5 w-3.5 shrink-0"} aria-hidden />
      {size === "lg" ? "Sync to Google Calendar" : <><span className="hidden sm:inline">Sync to Google Calendar</span><span className="sm:hidden">Sync</span></>}
    </button>
  );

  const defaultCalendarActions = (
    <>
      {syncBtn("sm")}
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
  );

  const toolbar = (fullscreen?: boolean) => (
    <ScheduleToolbar
      canUndo={canUndo} canRedo={canRedo} isDirty={isDirty}
      onUndo={undo} onRedo={redo} onReset={resetToBaseline} onAdd={openAddModal}
      onFullscreen={fullscreen ? () => setFullscreenOpen(true) : undefined}
    />
  );

  const calendarNode = (px: number, calHeader: ReactNode | null) => (
    <div className="flex flex-col space-y-3">
      {toolbar()}
      <div className="lg:min-h-[min(520px,calc(100vh-14rem))]">
        <WeeklyCalendar
          classes={classes} commitments={commitments} courseLabels={courseLabels} onApply={applyKeepingLabels}
          pxPerHour={px} headerActions={calHeader ?? undefined}
          hideScheduleHeading={calHeader === null} onBlockDoubleClick={openEditModal}
        />
      </div>
      <CommitmentsPanel commitments={commitments} onRemove={removeCommitment} />
    </div>
  );

  const walkAdvisoriesNode = walkAdvisories.length > 0 ? (
    <div className="space-y-1.5 rounded-xl border border-hub-gold/20 bg-hub-gold/[0.06] px-4 py-3">
      <p className="text-xs font-semibold text-hub-gold">Walk advisories</p>
      {walkAdvisories.map((advisory) => (
        <p key={advisory.key} className="text-xs text-white/60">
          {advisory.message}
        </p>
      ))}
    </div>
  ) : null;

  const splitMapAndCalendar = ({
    mapHeight,
    calendarPxPerHour = 52,
  }: {
    mapHeight: string;
    calendarPxPerHour?: number;
  }) => (
    <div className="space-y-3">
      {walkAdvisoriesNode}
      <div className="flex flex-col overflow-hidden rounded-xl border border-white/[0.06] xl:h-[85vh] xl:min-h-[720px] xl:flex-row">
        <div className="relative min-h-[360px] min-w-0 overflow-hidden xl:min-h-0 xl:flex-[3]">
          {scheduleItems.length > 0 ? (
            <CampusPathMap
              scheduleItems={scheduleItems}
              transitionInsights={transitionInsights}
              highlightedDossierId={selectedClassId}
              dossierMarkerMap={dossierMarkerMap}
              mapHeight={mapHeight}
              onMarkerClick={(id) => setSelectedClassId(id)}
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-xl border border-white/[0.08] bg-hub-surface/70 text-sm text-white/40">
              No on-campus courses to map
            </div>
          )}
          {scheduleItems.length > 0 ? (
            <button
              type="button"
              onClick={() => setMapFullscreen(true)}
              className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-md border border-white/[0.12] bg-hub-bg/80 px-3 py-1.5 text-xs font-medium text-white/70 backdrop-blur-sm transition hover:border-white/[0.2] hover:text-white/90 active:scale-[0.98]"
            >
              <Maximize2 className="h-3.5 w-3.5" aria-hidden />
              Full screen
            </button>
          ) : null}
        </div>

        <div className="h-px w-full shrink-0 bg-white/[0.05] xl:h-auto xl:w-px" />

        <div
          ref={calendarRef}
          className="min-w-0 bg-hub-surface/95 xl:flex-[2] xl:min-h-0 xl:self-stretch"
        >
          <div className="flex h-full flex-col p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
                Weekly schedule
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {syncBtn("sm")}
                <button
                  type="button"
                  onClick={() => setFullscreenOpen(true)}
                  title="Expand schedule to full screen"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-hub-bg/55 px-2.5 py-1.5 text-[11px] font-medium text-hub-text-secondary transition hover:border-hub-cyan/25 hover:text-hub-text"
                >
                  <Maximize2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="hidden sm:inline">Full screen</span>
                </button>
              </div>
            </div>
            {toolbar()}
            <div className="mt-4 min-h-0 flex-1">
              <WeeklyCalendar
                classes={classes}
                commitments={commitments}
                courseLabels={courseLabels}
                onApply={applyKeepingLabels}
                pxPerHour={calendarPxPerHour}
                className="h-full"
                fillAvailableHeight
                hideScheduleHeading
                onBlockDoubleClick={openEditModal}
                onBlockClick={(id) => setSelectedClassId((prev) => (prev === id ? null : id))}
                highlightedDossierId={selectedClassId}
              />
            </div>
            {commitments.length > 0 ? (
              <div className="mt-4">
                <CommitmentsPanel commitments={commitments} onRemove={removeCommitment} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  const renderScheduleJourneyPhase = ({
    key,
    heroDifficulty,
    includeSavePrompt,
  }: {
    key: string;
    heroDifficulty: boolean;
    includeSavePrompt: boolean;
  }) => (
    <motion.div
      key={key}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-8"
    >
      <AnimatePresence>
        {includeSavePrompt && showSavePrompt && (
          <motion.div
            key="save-prompt"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="flex items-start justify-between gap-4 rounded-xl border border-hub-cyan/20 bg-hub-cyan/[0.07] px-5 py-4"
          >
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-white/90">
                Do you want to save this schedule?
              </p>
              <p className="text-xs text-white/50">
                Note: You can save your schedule at any time using the Save plan button above.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void onSave?.();
                  onSavePromptDismiss?.();
                }}
                className="rounded-lg bg-hub-cyan px-3 py-1.5 text-xs font-semibold text-hub-bg transition hover:bg-hub-cyan/85"
              >
                Save schedule
              </button>
              <button
                type="button"
                onClick={onSavePromptDismiss}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-white/50 transition hover:text-white/70"
              >
                Not now
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid items-start gap-8 xl:grid-cols-[3fr_2fr]">
        <DifficultyScoreHud
          evaluation={evaluation}
          isHero={heroDifficulty}
          onGoToCourses={openFirstCourse}
          onOpenCalendar={openCalendar}
        />
        <ExamsPanel classes={classes} />
      </div>

      {splitMapAndCalendar({ mapHeight: "h-[360px] xl:h-full" })}

      <section className="space-y-[40px] border-t border-white/[0.06] pt-[32px] xl:pt-[40px]">
        <div>
          <h2 className="font-[family-name:var(--font-outfit)] text-[24px] font-semibold tracking-[-0.03em] text-hub-text">
            Course dossiers
          </h2>
          <p className="mt-2 text-sm leading-7 text-hub-text-secondary">
            Detailed course pages for final review.
          </p>
        </div>
        <div className="space-y-[40px] xl:space-y-[56px]">
          {classes.map((course) => (
            <section
              key={course.id}
              id={`review-dossier-${course.id}`}
              className="scroll-mt-24 border-t border-white/[0.06] pt-[24px] first:border-t-0 first:pt-0"
            >
              <CourseJourneyPage
                dossier={course}
                onUpdate={(patch) => onUpdateDossier(course.id, patch)}
              />
            </section>
          ))}
        </div>
      </section>
    </motion.div>
  );

  const renderPhaseTabs = (underlineId: string, className = "") => (
    <div className={`min-w-0 overflow-x-auto hub-scroll ${className}`}>
      <div className="flex w-max items-center gap-1 pb-1">
        {workspaceTabs.map((phase) => {
          const Icon = phase.icon;
          const isActive = currentPhase === phase.id;
          return (
            <button
              key={phase.id}
              type="button"
              onClick={() => setCurrentPhase(phase.id)}
              className={`relative flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-sm transition-all duration-200 active:scale-[0.98] ${
                isActive
                  ? "font-semibold text-white/90"
                  : "font-medium text-white/40 hover:text-white/70"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-hub-cyan" : ""}`} aria-hidden />
              {phase.label}
              {isActive && (
                <motion.span
                  layoutId={underlineId}
                  className="absolute inset-x-2 -bottom-1 h-px rounded-full bg-hub-cyan"
                  transition={{ type: "spring", stiffness: 400, damping: 35 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderWorkspacePhase = () => {
    if (currentPhase === "overview") {
      return (
        <motion.div
          key="phase-overview"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="grid items-start gap-8 xl:grid-cols-[3fr_2fr]"
        >
          <DifficultyScoreHud
            evaluation={evaluation}
            isHero
            onGoToCourses={openFirstCourse}
            onOpenCalendar={openCalendar}
          />
          <ExamsPanel classes={classes} />
        </motion.div>
      );
    }

    if (activeCourse) {
      return (
        <motion.div
          key={`phase-${activeCourse.id}`}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <CourseJourneyPage
            dossier={activeCourse}
            onUpdate={(patch) => onUpdateDossier(activeCourse.id, patch)}
          />
        </motion.div>
      );
    }

    if (currentPhase === "logistics") {
      return (
        <motion.div
          key="phase-logistics"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-3"
        >
          {splitMapAndCalendar({ mapHeight: "h-[360px] xl:h-full" })}
        </motion.div>
      );
    }

    return renderScheduleJourneyPhase({
      key: "phase-review",
      heroDifficulty: false,
      includeSavePrompt: true,
    });
  };

  return (
    <>
      {/* Mobile tab switcher */}
      <div className="mb-4 flex lg:hidden">
        <div className="flex w-full rounded-xl border border-white/[0.08] bg-hub-bg/40 p-1">
          {(["dossier", "schedule"] as MainTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setMainTab(tab)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition ${
                mainTab === tab ? "bg-hub-surface-elevated text-hub-text shadow-sm" : "text-hub-text-muted hover:text-hub-text-secondary"
              }`}
            >
              {tab === "dossier" ? <><LayoutGrid className="h-4 w-4 opacity-70" aria-hidden />Courses</> : "Schedule"}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile: linear stack */}
      <div className="flex min-h-0 flex-col gap-6 lg:hidden">
        <div ref={calendarRef} className={mainTab === "dossier" ? "hidden" : ""}>
          {calendarNode(78, calendarHeaderActions ? <>{defaultCalendarActions}{calendarHeaderActions}</> : defaultCalendarActions)}
        </div>
        <div className={`space-y-5 ${mainTab === "schedule" ? "hidden" : ""}`}>
          <div className="overflow-x-auto border-b border-white/[0.06] pb-1 hub-scroll">
            {renderPhaseTabs("mobile-phase-underline")}
          </div>
          {renderWorkspacePhase()}
        </div>
      </div>

      {/* Desktop: 4-phase guided workspace */}
      <div className="hidden lg:block space-y-8 rounded-xl p-1">

        {/* Phase navigation — flat tab row, no surrounding border box */}
        <nav
          className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-b border-white/[0.06] pb-1 pt-[10px]"
          aria-label="Workspace phases"
        >
          <div />
          {renderPhaseTabs("desktop-phase-underline", "mt-[10px] ml-[10px] w-fit max-w-full justify-self-center")}

          {/* Tagged Posts — community overlay launcher */}
          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCommunityOverlayOpen(true)}
              className="flex shrink-0 items-center gap-2 rounded-lg border border-hub-cyan/20 bg-hub-cyan/[0.06] px-3.5 py-2 text-sm font-medium text-hub-cyan/80 transition hover:border-hub-cyan/40 hover:bg-hub-cyan/[0.12] hover:text-hub-cyan"
            >
              <Users className="h-4 w-4 shrink-0" aria-hidden />
              Tagged Posts
            </button>

          {/* Save plan — far right of phase nav */}
          {onSave && (
            <div className="flex items-center gap-3 pl-2">
              <AnimatePresence mode="wait">
                {saveError ? (
                  <motion.span
                    key="save-error"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="text-xs text-hub-danger"
                  >
                    {saveError}
                  </motion.span>
                ) : lastSavedAt ? (
                  <motion.span
                    key="save-ts"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="text-xs text-white/40"
                  >
                    Last saved {formatSaveTime(lastSavedAt)}
                  </motion.span>
                ) : null}
              </AnimatePresence>
              <div className="relative">
                {(isDirty || hasDossierEdits) && !isSaving && (
                  <span
                    title="Unsaved changes"
                    className="absolute -right-1 -top-1 z-10 h-2 w-2 rounded-full bg-orange-400 shadow-[0_0_6px_rgba(251,146,60,0.7)]"
                  />
                )}
                <button
                  type="button"
                  onClick={() => void onSave()}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-hub-cyan/35 bg-hub-cyan/10 px-3 py-1.5 text-xs font-semibold text-hub-cyan transition hover:bg-hub-cyan/18 disabled:opacity-50"
                >
                  {isSaving ? "Saving…" : "Save plan"}
                </button>
              </div>
            </div>
          )}
          </div>
        </nav>
        {renderWorkspacePhase()}
      </div>

      {/* Map fullscreen overlay — Phase 3 */}
      <AnimatePresence>
        {mapFullscreen && (
          <motion.div
            key="map-fs"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] bg-hub-bg"
            role="dialog" aria-modal="true" aria-label="Full screen campus map"
          >
            <CampusPathMap
              scheduleItems={scheduleItems} transitionInsights={transitionInsights}
              highlightedDossierId={selectedClassId} dossierMarkerMap={dossierMarkerMap}
              mapHeight="h-screen"
            />
            <button
              type="button"
              onClick={() => setMapFullscreen(false)}
              className="absolute right-5 top-5 z-[61] flex items-center gap-2 rounded-md border border-white/[0.14] bg-hub-bg/80 px-3 py-2 text-xs font-medium text-white/80 backdrop-blur-sm transition hover:border-white/[0.25] hover:text-white active:scale-[0.98]"
            >
              <Minimize2 className="h-3.5 w-3.5" aria-hidden />
              Exit full screen
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fullscreen calendar overlay */}
      <AnimatePresence>
        {fullscreenOpen && (
          <motion.div
            key="fs-cal"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[color-mix(in_srgb,var(--hub-bg)_96%,transparent)] p-4 backdrop-blur-md md:p-6"
            role="dialog" aria-modal="true" aria-label="Full screen schedule"
            onClick={() => setFullscreenOpen(false)}
          >
            <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
                <div className="min-w-0">
                  <p className="font-[family-name:var(--font-outfit)] text-base font-semibold tracking-tight text-hub-text">Weekly schedule</p>
                  <p className="text-[11px] text-hub-text-muted">Full view · drag blocks to rearrange</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {syncBtn("lg")}
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
              {toolbar()}
              <div className="min-h-0 flex-1 overflow-hidden rounded-xl">
                <WeeklyCalendar
                  classes={classes} commitments={commitments} courseLabels={courseLabels} onApply={applyKeepingLabels}
                  pxPerHour={72}
                  className="h-full"
                  fillAvailableHeight
                  hideScheduleHeading
                  onBlockDoubleClick={openEditModal}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* View Calendar FAB — only in overview/dossiers phases */}
      <AnimatePresence>
        {!calendarVisible && !fullscreenOpen && currentPhase !== "logistics" && currentPhase !== "review" && (
          <motion.button
            key="view-cal-fab" type="button"
            initial={{ opacity: 0, y: 16, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.92 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.28 }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.93 }}
            onClick={openCalendar}
            className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-hub-cyan/40 bg-hub-surface/90 px-4 py-2.5 text-xs font-semibold text-hub-cyan shadow-lg backdrop-blur-sm"
          >
            <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
            View Calendar
          </motion.button>
        )}
      </AnimatePresence>

      {/* Add commitment modal */}
      <AddCommitmentModal
        open={addOpen} formId={formId}
        title={newTitle} day={newDay} start={newStart} end={newEnd} color={newColor} error={blockError}
        onTitleChange={setNewTitle} onDayChange={setNewDay} onStartChange={setNewStart}
        onEndChange={setNewEnd} onColorChange={setNewColor}
        onClose={() => setAddOpen(false)} onSubmit={submitCommitment}
      />

      {/* Edit block modal */}
      <EditBlockModal
        block={editingBlock}
        title={editTitle} day={editDay} start={editStart} end={editEnd} color={editColor} location={editLocation}
        error={editError}
        onTitleChange={setEditTitle} onDayChange={setEditDay} onStartChange={setEditStart}
        onEndChange={setEditEnd} onColorChange={setEditColor} onLocationChange={setEditLocation}
        onClose={() => setEditingBlock(null)} onSubmit={submitEdit}
        onDeleteCommitment={() => {
          if (editingBlock?.kind === "commitment") { removeCommitment(editingBlock.commitment.id); setEditingBlock(null); }
        }}
        onDeleteMeeting={() => {
          if (editingBlock?.kind === "course") deleteMeeting(editingBlock);
        }}
      />

      <AnimatePresence>
        {calendarExportPromptOpen && (
          <motion.div
            key="calendar-export-prompt"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 backdrop-blur-sm"
            onClick={() => setCalendarExportPromptOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-md rounded-2xl border border-white/[0.10] bg-hub-surface-elevated p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="font-[family-name:var(--font-outfit)] text-sm font-semibold text-hub-text">
                Export to Google Calendar
              </p>
              <p className="mt-2 text-xs leading-relaxed text-hub-text-muted">
                Choose whether you want Reg2Schedg to include one-time exam slots along with your weekly classes and custom blocks.
              </p>

              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                <input
                  type="checkbox"
                  checked={includeExamTimesInExport}
                  onChange={(e) => setIncludeExamTimesInExport(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-transparent text-hub-cyan focus:ring-hub-cyan/30"
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium text-hub-text">
                    Add exam times as well?
                  </span>
                  <span className="block text-xs leading-relaxed text-hub-text-muted">
                    Warning: these often change due to department scheduling conflicts, you may have to change them in the future.
                  </span>
                </span>
              </label>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCalendarExportPromptOpen(false)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-white/50 transition hover:text-white/75"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitCalendarExport}
                  className="rounded-lg bg-hub-cyan px-3 py-1.5 text-xs font-semibold text-hub-bg transition hover:bg-hub-cyan/85"
                >
                  Export
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Rename-all confirmation ── */}
      <AnimatePresence>
        {pendingRename && (
          <motion.div
            key="rename-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 backdrop-blur-sm"
            onClick={() => setPendingRename(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-sm rounded-2xl border border-white/[0.10] bg-hub-surface-elevated p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="font-[family-name:var(--font-outfit)] text-sm font-semibold text-hub-text">
                Rename other entries?
              </p>
              <p className="mt-2 text-xs leading-relaxed text-hub-text-muted">
                {pendingRename.kind === "commitment" ? (
                  <>
                    This block was renamed from{" "}
                    <span className="font-semibold text-hub-text">&ldquo;{pendingRename.oldTitle}&rdquo;</span>{" "}
                    to{" "}
                    <span className="font-semibold text-hub-text">&ldquo;{pendingRename.newName}&rdquo;</span>.{" "}
                    <span className="font-semibold text-hub-text">{pendingRename.otherCount}</span>{" "}
                    other block{pendingRename.otherCount === 1 ? "" : "s"} still {pendingRename.otherCount === 1 ? "has" : "have"} the old name.
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-hub-text">{pendingRename.otherCount}</span>{" "}
                    other calendar {pendingRename.otherCount === 1 ? "entry" : "entries"} will also be renamed from{" "}
                    <span className="font-semibold text-hub-text">&ldquo;{pendingRename.oldName}&rdquo;</span>{" "}
                    to{" "}
                    <span className="font-semibold text-hub-text">&ldquo;{pendingRename.newName}&rdquo;</span>.
                  </>
                )}
              </p>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={pendingRename.kind === "course" ? confirmRenameSingle : () => setPendingRename(null)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-white/50 transition hover:text-white/75"
                >
                  Just this one
                </button>
                <button
                  type="button"
                  onClick={confirmRenameAll}
                  className="rounded-lg bg-hub-cyan px-3 py-1.5 text-xs font-semibold text-hub-bg transition hover:bg-hub-cyan/85"
                >
                  Rename all {pendingRename.otherCount + 1}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Course Dashboard Modal ── */}

      {/* ── Tagged Posts overlay ── */}
      <AnimatePresence>
        {communityOverlayOpen && (
          <ScheduledPostsOverlay
            classes={classes}
            onClose={() => setCommunityOverlayOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
});
