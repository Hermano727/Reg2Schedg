"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { createClient } from "@/lib/supabase/client";
import { isUcsdEmail } from "@/lib/auth/ucsd";
import {
  buildPayloadFromClasses,
  buildPayloadV2,
  canSaveAsV2,
  parsePlanPayload,
  type SavedPlanPayloadV1,
} from "@/lib/hub/plan-payload";
import { vaultRowToVaultItem } from "@/lib/hub/vault-map";
import { mockDossier } from "@/lib/mock/dossier";
import type { SavedPlanRow, VaultItemRow } from "@/types/saved-plan";
import type {
  ClassDossier,
  ScheduleCommitment,
  ScheduleEvaluation,
  UiPhase,
  VaultItem,
} from "@/types/dossier";
import type { DossierScheduleWorkspaceHandle } from "@/components/dashboard/DossierScheduleWorkspace";
import { courseResearchResultToDossier } from "@/lib/mappers/courseEntryToDossier";
import type { CourseResearchResult } from "@/lib/api/parse";

const API_BASE = "http://localhost:8000";

/**
 * Ensure every ClassDossier has a non-empty `id`.
 * Plans saved before `id` was added to the type will have `id: undefined` when
 * deserialized from JSON. Derive it from courseCode so blockKeys are unique.
 */
function normalizeDossierIds(classes: ClassDossier[]): ClassDossier[] {
  return classes.map((c, i) => {
    if (c.id) return c;
    const base = c.courseCode
      ? c.courseCode.toLowerCase().replace(/\s+/g, "-")
      : `course-${i}`;
    return { ...c, id: base };
  });
}

type SidebarPlan = {
  id: string;
  label: string;
  subtitle?: string;
  courseCount?: number;
  trendLabel?: string;
  fitnessScore?: number;
  fitnessMax?: number;
  updatedAt?: string;
};

type UsePlanSyncReturn = {
  authed: boolean;
  isUcsdUser: boolean;
  activePlanId: string;
  setActivePlanId: (id: string) => void;
  quarterLabel: string;
  sidebarPlans: SidebarPlan[];
  sidebarVault: VaultItem[];
  viewClasses: ClassDossier[];
  viewEvaluation: ScheduleEvaluation;
  viewCommitments: ScheduleCommitment[];
  viewCourseLabels: Record<string, string>;
  /** True while a v2 plan is being fetched from the server. Use to show a loading state instead of stale data. */
  isPlanLoading: boolean;
  persistCompletedSession: (payload: SavedPlanPayloadV1) => Promise<void>;
  handleSave: (titleOverride?: string) => Promise<void>;
  handleSaveOverwrite: () => Promise<void>;
  handleSaveAsNew: () => Promise<void>;
  handleAutoSave: (explicitClasses: ClassDossier[], explicitEvaluation: ScheduleEvaluation, titleOverride?: string) => Promise<string | null>;
  handleNewPlan: () => Promise<void>;
  handleDeletePlan: (id: string) => Promise<void>;
  handleRenamePlan: (id: string, newTitle: string) => Promise<void>;
  activePlanTitle: string;
};

type Params = {
  phase: UiPhase;
  classes: ClassDossier[];
  evaluation: ScheduleEvaluation;
  workspaceRef: RefObject<DossierScheduleWorkspaceHandle | null>;
  onPlanCreated?: () => void;
  /** Called when the currently active plan is deleted. CommandCenter uses this to reset to idle. */
  onActivePlanDeleted?: () => void;
  /** Called when a ?planId URL param is detected on mount and the plan is loaded. */
  onPlanFromUrl?: () => void;
};

// ---------------------------------------------------------------------------
// Server expansion helper
// ---------------------------------------------------------------------------

async function fetchExpandedPlan(
  planId: string,
  accessToken: string,
): Promise<{ classes: ClassDossier[]; evaluation: ScheduleEvaluation; commitments: ScheduleCommitment[]; courseLabels: Record<string, string> } | null> {
  try {
    const res = await fetch(`${API_BASE}/plans/${planId}/expanded`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      payload_version?: number;
      classes: CourseResearchResult[];
      evaluation: ScheduleEvaluation | null;
      commitments: ScheduleCommitment[];
      course_labels?: Record<string, string>;
    };
    // v1 passthrough: backend returns already-mapped camelCase ClassDossier[] — don't double-map.
    // v2 (default): backend returns snake_case CourseResearchResult-shaped objects that need mapping.
    const classes = data.payload_version === 1
      ? (data.classes ?? []) as unknown as ClassDossier[]
      : (data.classes ?? []).map(courseResearchResultToDossier);
    return {
      classes,
      evaluation: data.evaluation ?? mockDossier.evaluation,
      commitments: data.commitments ?? [],
      courseLabels: data.course_labels ?? {},
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePlanSync({
  phase,
  classes,
  evaluation,
  workspaceRef,
  onPlanCreated,
  onActivePlanDeleted,
  onPlanFromUrl,
}: Params): UsePlanSyncReturn {
  const [authed, setAuthed] = useState(false);
  const [isUcsdUser, setIsUcsdUser] = useState(false);
  const [remotePlans, setRemotePlans] = useState<SavedPlanRow[]>([]);
  const [remoteVault, setRemoteVault] = useState<VaultItemRow[]>([]);
  const [activePlanId, setActivePlanId] = useState(mockDossier.activeQuarterId);
  // Expanded v2 plan data (null = not yet loaded or not a v2 plan)
  const [expandedClasses, setExpandedClasses] = useState<ClassDossier[] | null>(null);
  const [expandedEvaluation, setExpandedEvaluation] = useState<ScheduleEvaluation | null>(null);
  const [expandedCommitments, setExpandedCommitments] = useState<ScheduleCommitment[] | null>(null);
  const [expandedCourseLabels, setExpandedCourseLabels] = useState<Record<string, string> | null>(null);
  const [isPlanLoading, setIsPlanLoading] = useState(false);

  const activePlanIdRef = useRef(activePlanId);
  const remotePlansRef = useRef(remotePlans);
  const authedRef = useRef(authed);
  const onActivePlanDeletedRef = useRef(onActivePlanDeleted);
  const onPlanFromUrlRef = useRef(onPlanFromUrl);

  activePlanIdRef.current = activePlanId;
  remotePlansRef.current = remotePlans;
  authedRef.current = authed;
  onActivePlanDeletedRef.current = onActivePlanDeleted;
  onPlanFromUrlRef.current = onPlanFromUrl;

  const loadHubData = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        setAuthed(false);
        setIsUcsdUser(false);
        setRemotePlans([]);
        setRemoteVault([]);
        setActivePlanId(mockDossier.activeQuarterId);
        return;
      }
      setAuthed(true);
      setIsUcsdUser(isUcsdEmail(user.email));
      const [plansRes, vaultRes] = await Promise.all([
        // Filter soft-deleted plans so they never appear in the sidebar or get selected
        supabase.from("saved_plans").select("*").eq("is_deleted", false).order("updated_at", { ascending: false }),
        supabase.from("vault_items").select("*").order("updated_at", { ascending: false }),
      ]);
      const plans = (plansRes.data as SavedPlanRow[] | null) ?? [];
      const vault = (vaultRes.data as VaultItemRow[] | null) ?? [];
      setRemotePlans(plans);
      setRemoteVault(vault);

      // Check for a ?planId URL param (e.g. from profile page links or browser refresh).
      // If present and valid, activate that plan. Otherwise: keep the current activePlanId
      // if it's still valid, or clear it — never auto-select the first plan.
      const urlPlanId = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("planId")
        : null;

      if (urlPlanId && plans.some((p) => p.id === urlPlanId)) {
        if (activePlanIdRef.current !== urlPlanId) {
          setActivePlanId(urlPlanId);
          onPlanFromUrlRef.current?.();
        }
      } else {
        const cur = activePlanIdRef.current;
        if (cur && !plans.some((p) => p.id === cur)) {
          setActivePlanId(""); // current plan was deleted or is a stale mock ID
        }
        // Otherwise keep cur as-is (valid plan still selected, or already empty)
      }
    } catch {
      setAuthed(false);
      setIsUcsdUser(false);
      setRemotePlans([]);
      setRemoteVault([]);
      setActivePlanId(mockDossier.activeQuarterId);
    }
  }, []);

  useEffect(() => {
    void loadHubData();
  }, [loadHubData]);

  // Expand the active plan when it changes.
  // IMPORTANT: remotePlans is intentionally NOT in the deps array.
  //   - Including it would cause this effect to re-run whenever loadHubData() refreshes
  //     the plan list (e.g. after every save), triggering a spurious loading screen and
  //     wiping the editor state.
  //   - We use remotePlansRef.current inside the effect so we always see the latest
  //     plan metadata without creating a dep-cycle.
  useEffect(() => {
    // Immediately clear stale data from the previous plan so it never bleeds through.
    setExpandedClasses(null);
    setExpandedEvaluation(null);
    setExpandedCommitments(null);
    setExpandedCourseLabels(null);

    if (!authed || !activePlanId) {
      setIsPlanLoading(false);
      return;
    }

    // Use the ref — safe because React renders and commits refs before effects fire.
    const plan = remotePlansRef.current.find((p) => p.id === activePlanId);
    if (!plan || (plan.payload_version ?? 1) < 2) {
      // v1 plan or unknown — payload is already in remotePlans, no server fetch needed.
      setIsPlanLoading(false);
      return;
    }

    // v2 plan — must fetch full dossiers from server.
    setIsPlanLoading(true);
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || cancelled) return;
      const expanded = await fetchExpandedPlan(activePlanId, session.access_token);
      if (cancelled) return;
      if (expanded) {
        setExpandedClasses(expanded.classes);
        setExpandedEvaluation(expanded.evaluation);
        setExpandedCommitments(expanded.commitments);
        setExpandedCourseLabels(expanded.courseLabels);
      }
      setIsPlanLoading(false);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, activePlanId]); // remotePlans deliberately excluded — see comment above

  const quarterLabel = useMemo(() => {
    if (!authed) {
      return (
        mockDossier.quarters.find((q) => q.id === activePlanId)?.label ??
        "Spring 2026"
      );
    }
    const plan = remotePlans.find((p) => p.id === activePlanId);
    if (plan?.quarter_label) return plan.quarter_label;
    if (plan) {
      const { activeQuarterId: aid } = parsePlanPayload(plan.payload);
      if (aid) {
        const q = mockDossier.quarters.find((x) => x.id === aid);
        if (q) return q.label;
      }
    }
    return "Schedule";
  }, [authed, activePlanId, remotePlans]);

  const sidebarPlans = useMemo<SidebarPlan[]>(() => {
    if (!authed) {
      return mockDossier.quarters.map((q) => ({ id: q.id, label: q.label }));
    }
    return remotePlans.map((p) => {
      let courseCount: number | undefined;
      let trendLabel: string | undefined;
      let fitnessScore: number | undefined;
      let fitnessMax: number | undefined;
      try {
        const raw = p.payload as Record<string, unknown> | null;
        if (raw) {
          const ver = (raw.version as number) ?? 1;
          if (ver === 2 && Array.isArray(raw.class_refs)) {
            courseCount = (raw.class_refs as unknown[]).length;
          } else if (Array.isArray(raw.classes)) {
            courseCount = (raw.classes as unknown[]).length;
          }
          const ev = raw.evaluation as { fitnessScore?: number; fitnessMax?: number; trendLabel?: string } | undefined;
          if (ev) {
            trendLabel = ev.trendLabel;
            fitnessScore = ev.fitnessScore;
            fitnessMax = ev.fitnessMax;
          }
        }
      } catch { /* malformed payload — skip metadata */ }

      return {
        id: p.id,
        label: p.title?.trim() || "Untitled plan",
        subtitle:
          p.quarter_label ||
          (p.status === "draft" ? "Draft" : undefined) ||
          undefined,
        courseCount,
        trendLabel,
        fitnessScore,
        fitnessMax,
        updatedAt: p.updated_at,
      };
    });
  }, [authed, remotePlans]);

  const sidebarVault = useMemo<VaultItem[]>(() => {
    if (!authed) return mockDossier.vaultItems;
    return remoteVault
      .filter(
        (v) =>
          !activePlanId ||
          v.plan_id === null ||
          v.plan_id === activePlanId,
      )
      .map(vaultRowToVaultItem);
  }, [authed, remoteVault, activePlanId]);

  const { viewClasses, viewEvaluation, viewCommitments, viewCourseLabels } = useMemo(() => {
    const empty = { viewClasses: [] as ClassDossier[], viewEvaluation: evaluation, viewCommitments: [] as ScheduleCommitment[], viewCourseLabels: {} as Record<string, string> };

    if (phase !== "dashboard" || !authed) {
      return { viewClasses: classes, viewEvaluation: evaluation, viewCommitments: [] as ScheduleCommitment[], viewCourseLabels: {} as Record<string, string> };
    }

    // While a plan is loading, return nothing so stale data from a previous plan never shows.
    if (isPlanLoading) return empty;

    // v2 plan — use server-expanded data if available
    if (expandedClasses !== null) {
      return {
        viewClasses: normalizeDossierIds(expandedClasses),
        viewEvaluation: expandedEvaluation ?? evaluation,
        viewCommitments: expandedCommitments ?? [],
        viewCourseLabels: expandedCourseLabels ?? {},
      };
    }

    // v1 plan — read full dossiers from payload
    const plan = remotePlans.find((p) => p.id === activePlanId);
    if (plan) {
      const parsed = parsePlanPayload(plan.payload);
      if (parsed.classes.length > 0) {
        return {
          viewClasses: normalizeDossierIds(parsed.classes),
          viewEvaluation: parsed.evaluation,
          viewCommitments: parsed.commitments ?? [],
          viewCourseLabels: parsed.courseLabels ?? {},
        };
      }
    }
    return { viewClasses: classes, viewEvaluation: evaluation, viewCommitments: [] as ScheduleCommitment[], viewCourseLabels: {} as Record<string, string> };
  }, [phase, authed, activePlanId, remotePlans, classes, evaluation, expandedClasses, expandedEvaluation, expandedCommitments, expandedCourseLabels, isPlanLoading]);

  // ---------------------------------------------------------------------------
  // Persist helpers
  // ---------------------------------------------------------------------------

  const persistCompletedSession = useCallback(async (payload: SavedPlanPayloadV1) => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let ql = "Spring 2026";
      const pid = activePlanIdRef.current;
      if (authedRef.current) {
        const p = remotePlansRef.current.find((x) => x.id === pid);
        if (p?.quarter_label) ql = p.quarter_label;
      } else {
        ql = mockDossier.quarters.find((q) => q.id === pid)?.label ?? ql;
      }

      const titleSuffix = new Date().toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
      const { data: inserted } = await supabase
        .from("saved_plans")
        .insert({
          user_id: user.id,
          title: `${ql} · ${titleSuffix}`,
          quarter_label: ql,
          status: "complete",
          payload_version: 1,
          payload,
        })
        .select("id")
        .single();

      const [plansRes, vaultRes] = await Promise.all([
        supabase.from("saved_plans").select("*").eq("is_deleted", false).order("updated_at", { ascending: false }),
        supabase.from("vault_items").select("*").order("updated_at", { ascending: false }),
      ]);
      setAuthed(true);
      // RLS already excludes other users' rows; filter here is just a safety net.
      setRemotePlans((plansRes.data as SavedPlanRow[] | null) ?? []);
      setRemoteVault((vaultRes.data as VaultItemRow[] | null) ?? []);
      if (inserted?.id) setActivePlanId(inserted.id as string);
    } catch {
      /* ignore persistence errors */
    }
  }, []);

  const _buildActiveQ = () => {
    const pid = activePlanIdRef.current;
    return !authedRef.current && mockDossier.quarters.some((q) => q.id === pid)
      ? pid
      : mockDossier.activeQuarterId;
  };

  const _saveplan = useCallback(async (
    planId: string | null,
    isNew: boolean,
    titleOverride?: string,
    explicitClasses?: ClassDossier[],
    explicitEvaluation?: ScheduleEvaluation,
  ): Promise<string | null> => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const activeQ = _buildActiveQ();
    // When explicit classes are passed (auto-save at research time), use them directly.
    // The workspace may not be mounted yet in that case.
    const editorClasses = explicitClasses ?? workspaceRef.current?.getCurrentClasses() ?? viewClasses;
    const editorCommitments = explicitClasses ? [] : (workspaceRef.current?.getCurrentCommitments() ?? []);
    const editorEvaluation = explicitEvaluation ?? viewEvaluation;
    const editorCourseLabels = explicitClasses ? {} : (workspaceRef.current?.getCurrentCourseLabels() ?? {});
    // explicitClasses = auto-save right after research: no user edits exist yet.
    const hasDossierEdits = explicitClasses ? false : (workspaceRef.current?.hasDossierEdits ?? false);

    // Use v2 if every class has a cacheId, otherwise fall back to v1
    const useV2 = canSaveAsV2(editorClasses);
    const payload = useV2
      ? buildPayloadV2(activeQ, editorClasses, editorCommitments, editorEvaluation, editorCourseLabels, hasDossierEdits)
      : buildPayloadFromClasses(activeQ, editorClasses, editorCommitments, editorEvaluation, editorCourseLabels);
    const payloadVersion = useV2 ? 2 : 1;

    const titleSuffix = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const qLabel = mockDossier.quarters.find((q) => q.id === activeQ)?.label ?? "";
    const autoTitle = `${qLabel || "Schedule"} · ${titleSuffix}`;

    if (isNew || !planId) {
      const { data } = await supabase
        .from("saved_plans")
        .insert({
          user_id: user.id,
          title: titleOverride?.trim() || autoTitle,
          quarter_label: qLabel,
          status: "draft",
          payload_version: payloadVersion,
          payload,
        })
        .select("id")
        .single();
      if (data?.id) setActivePlanId(data.id as string);
      await loadHubData();
      return (data?.id as string) ?? null;
    } else {
      await supabase.from("saved_plans").update({ payload, payload_version: payloadVersion }).eq("id", planId);
      await loadHubData();
      return planId;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewClasses, viewEvaluation, loadHubData, workspaceRef]);

  const handleSaveOverwrite = useCallback(async () => {
    try {
      await _saveplan(activePlanIdRef.current, false);
    } catch {
      /* ignore save errors */
    }
  }, [_saveplan]);

  const handleSaveAsNew = useCallback(async () => {
    try {
      await _saveplan(null, true);
    } catch {
      /* ignore save errors */
    }
  }, [_saveplan]);

  const handleNewPlan = useCallback(async () => {
    if (!authedRef.current) return;
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("saved_plans")
        .insert({
          user_id: user.id,
          title: "Untitled plan",
          quarter_label: "",
          status: "draft",
          payload_version: 1,
          payload: {},
        })
        .select("id")
        .single();
      if (error) return;
      await loadHubData();
      if (data?.id) setActivePlanId(data.id as string);
      onPlanCreated?.();
    } catch {
      /* ignore */
    }
  }, [loadHubData, onPlanCreated]);

  // Decides create-vs-overwrite automatically based on whether activePlanId is
  // a real saved plan row. No try/catch — errors propagate to the caller so it
  // can show a user-friendly message.
  const handleSave = useCallback(async (titleOverride?: string) => {
    const pid = activePlanIdRef.current;
    const isRealPlan = remotePlansRef.current.some((p) => p.id === pid);
    await _saveplan(isRealPlan ? pid : null, !isRealPlan, titleOverride);
  }, [_saveplan]);

  // Auto-save right after the research pipeline finishes, before the user interacts with the workspace.
  // Uses explicit classes/evaluation instead of reading from the editor (workspace not mounted yet).
  const handleAutoSave = useCallback(async (
    explicitClasses: ClassDossier[],
    explicitEvaluation: ScheduleEvaluation,
    titleOverride?: string,
  ): Promise<string | null> => {
    return _saveplan(null, true, titleOverride, explicitClasses, explicitEvaluation);
  }, [_saveplan]);

  const handleDeletePlan = useCallback(async (id: string) => {
    if (!authedRef.current) return;
    // Optimistically remove from UI immediately.
    setRemotePlans((prev) => prev.filter((p) => p.id !== id));
    const wasActive = activePlanIdRef.current === id;
    if (wasActive) setActivePlanId("");
    try {
      const supabase = createClient();
      const { error } = await supabase.from("saved_plans").delete().eq("id", id);
      if (error) throw error;
      if (wasActive) onActivePlanDeletedRef.current?.();
      // Re-sync in background to confirm server state — don't await so UI stays snappy.
      void loadHubData();
    } catch {
      // Revert optimistic removal on error.
      await loadHubData();
    }
  }, [loadHubData]);

  const handleRenamePlan = useCallback(async (id: string, newTitle: string) => {
    if (!authedRef.current || !newTitle.trim()) return;
    try {
      const supabase = createClient();
      await supabase.from("saved_plans").update({ title: newTitle.trim() }).eq("id", id);
      await loadHubData();
    } catch {
      /* ignore rename errors */
    }
  }, [loadHubData]);

  return {
    authed,
    isUcsdUser,
    activePlanId,
    setActivePlanId,
    quarterLabel,
    sidebarPlans,
    sidebarVault,
    viewClasses,
    viewEvaluation,
    viewCommitments,
    viewCourseLabels,
    isPlanLoading,
    persistCompletedSession,
    handleSave,
    handleSaveOverwrite,
    handleSaveAsNew,
    handleAutoSave,
    handleNewPlan,
    handleDeletePlan,
    handleRenamePlan,
    activePlanTitle: remotePlans.find((p) => p.id === activePlanId)?.title ?? "",
  };
}
