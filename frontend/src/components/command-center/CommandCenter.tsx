"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { IngestionHub } from "@/components/ingestion/IngestionHub";
import { ProcessingModal } from "@/components/modals/ProcessingModal";
import { DossierScheduleWorkspace } from "@/components/dashboard/DossierScheduleWorkspace";
import { mockDossier } from "@/lib/mock/dossier";
import { createClient } from "@/lib/supabase/client";
import {
  buildPayloadFromClasses,
  parsePlanPayload,
  type SavedPlanPayloadV1,
} from "@/lib/hub/plan-payload";
import { vaultRowToVaultItem } from "@/lib/hub/vault-map";
import { parseScreenshot } from "@/lib/api/parse";
import { courseEntryToDossier } from "@/lib/mappers/courseEntryToDossier";
import type { SavedPlanRow, VaultItemRow } from "@/types/saved-plan";
import type { ClassDossier, UiPhase } from "@/types/dossier";

const LINE_MS = 360;
const FINISH_PAD_MS = 650;

export function CommandCenter() {
  const [phase, setPhase] = useState<UiPhase>("idle");
  const [ingestionCollapsed, setIngestionCollapsed] = useState(false);
  const [activePlanId, setActivePlanId] = useState(mockDossier.activeQuarterId);
  const [classes, setClasses] = useState<ClassDossier[]>(mockDossier.classes);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [authed, setAuthed] = useState(false);
  const [remotePlans, setRemotePlans] = useState<SavedPlanRow[]>([]);
  const [remoteVault, setRemoteVault] = useState<VaultItemRow[]>([]);
  const timeoutsRef = useRef<number[]>([]);
  const processingLockRef = useRef(false);
  const activePlanIdRef = useRef(activePlanId);
  const remotePlansRef = useRef(remotePlans);
  const authedRef = useRef(authed);

  activePlanIdRef.current = activePlanId;
  remotePlansRef.current = remotePlans;
  authedRef.current = authed;

  const clearRun = useCallback(() => {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutsRef.current = [];
  }, []);

  useEffect(() => () => clearRun(), [clearRun]);

  const loadHubData = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setAuthed(false);
        setRemotePlans([]);
        setRemoteVault([]);
        setActivePlanId(mockDossier.activeQuarterId);
        return;
      }
      setAuthed(true);
      const [plansRes, vaultRes] = await Promise.all([
        supabase.from("saved_plans").select("*").order("updated_at", {
          ascending: false,
        }),
        supabase.from("vault_items").select("*").order("updated_at", {
          ascending: false,
        }),
      ]);
      const plans = (plansRes.data as SavedPlanRow[] | null) ?? [];
      const vault = (vaultRes.data as VaultItemRow[] | null) ?? [];
      setRemotePlans(plans);
      setRemoteVault(vault);
      if (plans.length > 0) {
        setActivePlanId((prev) =>
          plans.some((p) => p.id === prev) ? prev : plans[0].id,
        );
      } else {
        setActivePlanId("");
      }
    } catch {
      setAuthed(false);
      setRemotePlans([]);
      setRemoteVault([]);
      setActivePlanId(mockDossier.activeQuarterId);
    }
  }, []);

  useEffect(() => {
    void loadHubData();
  }, [loadHubData]);

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

  const sidebarPlans = useMemo(() => {
    if (!authed) {
      return mockDossier.quarters.map((q) => ({
        id: q.id,
        label: q.label,
      }));
    }
    return remotePlans.map((p) => ({
      id: p.id,
      label: p.title?.trim() || "Untitled plan",
      subtitle:
        p.quarter_label ||
        (p.status === "draft" ? "Draft" : undefined) ||
        undefined,
    }));
  }, [authed, remotePlans]);

  const sidebarVault = useMemo(() => {
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

  const { viewClasses, viewEvaluation } = useMemo(() => {
    if (phase !== "dashboard") {
      return {
        viewClasses: classes,
        viewEvaluation: mockDossier.evaluation,
      };
    }
    if (!authed) {
      return {
        viewClasses: classes,
        viewEvaluation: mockDossier.evaluation,
      };
    }
    const plan = remotePlans.find((p) => p.id === activePlanId);
    if (plan) {
      const parsed = parsePlanPayload(plan.payload);
      if (parsed.classes.length > 0) {
        return {
          viewClasses: parsed.classes,
          viewEvaluation: parsed.evaluation,
        };
      }
    }
    return {
      viewClasses: classes,
      viewEvaluation: mockDossier.evaluation,
    };
  }, [phase, authed, activePlanId, remotePlans, classes]);

  const classCount =
    phase === "dashboard" ? viewClasses.length : classes.length;

  const persistCompletedSession = useCallback(async (payload: SavedPlanPayloadV1) => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      let ql = "Spring 2026";
      const pid = activePlanIdRef.current;
      if (authedRef.current) {
        const p = remotePlansRef.current.find((x) => x.id === pid);
        if (p?.quarter_label) ql = p.quarter_label;
      } else {
        ql =
          mockDossier.quarters.find((q) => q.id === pid)?.label ?? ql;
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
        supabase.from("saved_plans").select("*").order("updated_at", {
          ascending: false,
        }),
        supabase.from("vault_items").select("*").order("updated_at", {
          ascending: false,
        }),
      ]);
      setAuthed(true);
      setRemotePlans((plansRes.data as SavedPlanRow[] | null) ?? []);
      setRemoteVault((vaultRes.data as VaultItemRow[] | null) ?? []);
      if (inserted?.id) setActivePlanId(inserted.id as string);
    } catch {
      /* ignore persistence errors */
    }
  }, []);

  const runIngestionFlow = useCallback(
    async (imageFile: File | undefined) => {
      if (processingLockRef.current) return;
      processingLockRef.current = true;
      clearRun();
      setPhase("processing");
      setTerminalLines([]);

      const script = mockDossier.terminalScript;
      script.forEach((line, idx) => {
        const id = window.setTimeout(() => {
          setTerminalLines((prev) => [...prev, line]);
        }, idx * LINE_MS);
        timeoutsRef.current.push(id);
      });

      const minWait = script.length * LINE_MS + FINISH_PAD_MS;
      const started = Date.now();

      let nextClasses: ClassDossier[] = mockDossier.classes;
      if (imageFile?.type.startsWith("image/")) {
        try {
          const response = await parseScreenshot(imageFile);
          const parsed = response.courses.map(courseEntryToDossier);
          if (parsed.length > 0) nextClasses = parsed;
        } catch {
          /* keep mock dossier */
        }
      }

      const elapsed = Date.now() - started;
      const remaining = Math.max(0, minWait - elapsed);
      await new Promise<void>((resolve) => {
        const id = window.setTimeout(() => resolve(), remaining);
        timeoutsRef.current.push(id);
      });

      clearRun();
      setClasses(nextClasses);
      processingLockRef.current = false;
      setPhase("dashboard");
      setIngestionCollapsed(true);

      const pid = activePlanIdRef.current;
      const activeQ =
        !authedRef.current &&
        mockDossier.quarters.some((q) => q.id === pid)
          ? pid
          : mockDossier.activeQuarterId;
      const payload = buildPayloadFromClasses(
        activeQ,
        nextClasses,
        mockDossier.evaluation,
      );
      await persistCompletedSession(payload);
    },
    [clearRun, persistCompletedSession],
  );

  const handleFilesSelected = useCallback(
    (files: FileList | File[]) => {
      const imageFile = Array.from(files).find((f) =>
        f.type.startsWith("image/"),
      );
      void runIngestionFlow(imageFile);
    },
    [runIngestionFlow],
  );

  const handleManualSubmit = useCallback(
    (_payload: {
      professor: string;
      course: string;
      quarter: string;
    }) => {
      void runIngestionFlow(undefined);
    },
    [runIngestionFlow],
  );

  const resetDemo = useCallback(() => {
    clearRun();
    processingLockRef.current = false;
    setPhase("idle");
    setIngestionCollapsed(false);
    setTerminalLines([]);
    setClasses(mockDossier.classes);
  }, [clearRun]);

  const handleNewPlan = useCallback(async () => {
    if (!authed) return;
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
      resetDemo();
    } catch {
      /* ignore */
    }
  }, [authed, loadHubData, resetDemo]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <main
          className={`relative min-w-0 flex-1 overflow-y-auto py-4 pb-10 ${
            phase === "dashboard"
              ? "px-4 lg:pl-3 lg:pr-8"
              : "px-4 lg:px-6"
          }`}
        >
          <div
            className={`mx-auto w-full ${phase === "dashboard" ? "max-w-[min(100%,1760px)]" : "max-w-4xl"} ${phase === "processing" ? "pointer-events-none blur-[2px]" : ""}`}
          >
            <nav
              className="mb-4 flex flex-wrap items-center gap-1 text-xs text-hub-text-muted"
              aria-label="Breadcrumb"
            >
              <span>Schedules</span>
              <ChevronRight className="h-3 w-3" aria-hidden />
              <span className="font-medium text-hub-text-secondary">
                {quarterLabel}
              </span>
              {phase === "dashboard" ? (
                <>
                  <ChevronRight className="h-3 w-3" aria-hidden />
                  <span className="text-hub-cyan">Courses</span>
                </>
              ) : null}
            </nav>

            <IngestionHub
              phase={phase}
              collapsed={ingestionCollapsed}
              onToggleCollapse={() => setIngestionCollapsed((c) => !c)}
              onFilesSelected={handleFilesSelected}
              onManualSubmit={handleManualSubmit}
              classCount={classCount}
              quarterLabel={quarterLabel}
            />

            <AnimatePresence mode="popLayout">
              {phase === "dashboard" ? (
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
                      scheduleItems={mockDossier.scheduleItems}
                      transitionInsights={mockDossier.transitionInsights}
                    />
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </main>
        <RightSidebar
          planSectionTitle={authed ? "Saved plans" : "My Quarters"}
          plans={sidebarPlans}
          activePlanId={activePlanId}
          onSelectPlan={setActivePlanId}
          newPlanLabel={
            authed ? "New saved plan" : "New quarter research"
          }
          onNewPlan={authed ? handleNewPlan : undefined}
          vaultItems={sidebarVault}
          vaultSynced={authed}
        />
      </div>

      <ProcessingModal open={phase === "processing"} lines={terminalLines} />
    </div>
  );
}
