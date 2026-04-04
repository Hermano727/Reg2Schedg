"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { IngestionHub } from "@/components/ingestion/IngestionHub";
import { ProcessingModal } from "@/components/modals/ProcessingModal";
import { ClassCard } from "@/components/dashboard/ClassCard";
import { EvaluatorFooter } from "@/components/dashboard/EvaluatorFooter";
import { WeeklyCalendar } from "@/components/dashboard/WeeklyCalendar";
import { mockDossier } from "@/lib/mock/dossier";
import { parseScreenshot } from "@/lib/api/parse";
import { courseEntryToDossier } from "@/lib/mappers/courseEntryToDossier";
import type { ClassDossier, UiPhase } from "@/types/dossier";

const LINE_MS = 360;
const FINISH_PAD_MS = 650;

export function CommandCenter() {
  const [phase, setPhase] = useState<UiPhase>("idle");
  const [ingestionCollapsed, setIngestionCollapsed] = useState(false);
  const [classes, setClasses] = useState<ClassDossier[]>(mockDossier.classes);
  const [activeQuarterId, setActiveQuarterId] = useState(
    mockDossier.activeQuarterId,
  );
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const timeoutsRef = useRef<number[]>([]);
  const processingLockRef = useRef(false);

  const clearRun = useCallback(() => {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutsRef.current = [];
  }, []);

  useEffect(() => () => clearRun(), [clearRun]);

  const quarterLabel =
    mockDossier.quarters.find((q) => q.id === activeQuarterId)?.label ??
    "Spring 2026";

  const startProcessing = useCallback(() => {
    if (processingLockRef.current) return false;
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
    return true;
  }, [clearRun]);

  const finishProcessing = useCallback(() => {
    setPhase("dashboard");
    setIngestionCollapsed(true);
    processingLockRef.current = false;
    clearRun();
  }, [clearRun]);

  const handleFilesSelected = useCallback(
    async (files: FileList | File[]) => {
      const imageFile = Array.from(files).find((f) =>
        f.type.startsWith("image/"),
      );

      if (!imageFile) {
        // Non-image drop — fall back to mock flow with timer
        if (!startProcessing()) return;
        const script = mockDossier.terminalScript;
        const doneId = window.setTimeout(() => {
          finishProcessing();
        }, script.length * LINE_MS + FINISH_PAD_MS);
        timeoutsRef.current.push(doneId);
        return;
      }

      if (!startProcessing()) return;

      try {
        const response = await parseScreenshot(imageFile);
        const parsed = response.courses.map(courseEntryToDossier);
        setClasses(parsed.length > 0 ? parsed : mockDossier.classes);
      } catch {
        // keep mock classes on error
      }

      finishProcessing();
    },
    [startProcessing, finishProcessing],
  );

  const handleManualSubmit = useCallback(() => {
    if (!startProcessing()) return;
    const script = mockDossier.terminalScript;
    const doneId = window.setTimeout(() => {
      finishProcessing();
    }, script.length * LINE_MS + FINISH_PAD_MS);
    timeoutsRef.current.push(doneId);
  }, [startProcessing, finishProcessing]);

  const resetDemo = useCallback(() => {
    clearRun();
    processingLockRef.current = false;
    setPhase("idle");
    setIngestionCollapsed(false);
    setTerminalLines([]);
    setClasses(mockDossier.classes);
  }, [clearRun]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1 overflow-y-auto px-4 py-4 pb-10 lg:px-6">
          <div
            className={`mx-auto max-w-4xl ${phase === "processing" ? "pointer-events-none blur-[2px]" : ""}`}
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
                  <span className="text-hub-cyan">Dossier view</span>
                </>
              ) : null}
            </nav>

            <IngestionHub
              phase={phase}
              collapsed={ingestionCollapsed}
              onToggleCollapse={() =>
                setIngestionCollapsed((c) => !c)
              }
              onFilesSelected={handleFilesSelected}
              onManualSubmit={handleManualSubmit}
              classCount={classes.length}
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
                  <WeeklyCalendar classes={classes} />
                  {classes.map((c) => (
                    <ClassCard key={c.id} dossier={c} />
                  ))}
                  <EvaluatorFooter evaluation={mockDossier.evaluation} />
                  <p className="pt-2 text-center text-[11px] text-hub-text-muted">
                    <button
                      type="button"
                      onClick={resetDemo}
                      className="underline decoration-white/20 underline-offset-2 hover:text-hub-cyan"
                    >
                      Reset demo state
                    </button>
                  </p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </main>
        <RightSidebar
          quarters={mockDossier.quarters.map((q) => ({
            ...q,
            isActive: q.id === activeQuarterId,
          }))}
          activeQuarterId={activeQuarterId}
          onSelectQuarter={setActiveQuarterId}
          vaultItems={mockDossier.vaultItems}
        />
      </div>

      <ProcessingModal open={phase === "processing"} lines={terminalLines} />
    </div>
  );
}
