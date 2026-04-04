"use client";

import { motion } from "framer-motion";
import { ChevronDown, ChevronUp, Upload } from "lucide-react";
import { DropZone } from "@/components/ingestion/DropZone";
import { ManualResearchForm } from "@/components/ingestion/ManualResearchForm";

type IngestionHubProps = {
  phase: "idle" | "processing" | "dashboard";
  collapsed: boolean;
  onToggleCollapse: () => void;
  onFilesSelected: (files: FileList | File[]) => void;
  onManualSubmit: (payload: {
    professor: string;
    course: string;
    quarter: string;
  }) => void;
  classCount: number;
  quarterLabel: string;
};

export function IngestionHub({
  phase,
  collapsed,
  onToggleCollapse,
  onFilesSelected,
  onManualSubmit,
  classCount,
  quarterLabel,
}: IngestionHubProps) {
  const busy = phase === "processing";

  if (phase === "dashboard" && collapsed) {
    return (
      <motion.div
        layout
        className="glass-panel mb-4 rounded-xl border border-white/[0.08] p-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-hub-text-muted">
              Ingestion
            </p>
            <p className="text-sm text-hub-text">
              <span className="font-[family-name:var(--font-outfit)] font-semibold">
                {quarterLabel}
              </span>
              <span className="text-hub-text-muted"> · </span>
              <span>{classCount} classes in dossier</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleCollapse}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.1] px-3 text-xs font-medium text-hub-text-secondary transition hover:border-hub-cyan/35 hover:text-hub-cyan"
            >
              <Upload className="h-3.5 w-3.5" />
              Add files
            </button>
            <button
              type="button"
              onClick={onToggleCollapse}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.1] text-hub-text-muted hover:text-hub-text"
              aria-label="Expand ingestion panel"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  const isDashboardExpanded = phase === "dashboard" && !collapsed;

  return (
    <motion.section
      layout
      className="glass-panel mb-6 rounded-xl border border-white/[0.08] p-4"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold tracking-tight text-hub-text">
            {isDashboardExpanded ? "Add sources" : "Ingestion hub"}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-hub-text-secondary">
            {isDashboardExpanded
              ? "Attach another WebReg export or syllabus to refresh dossiers for this quarter."
              : "Start with your WebReg table or syllabi. TritonHub aggregates registrar facts with community signal so you are not guessing logistics from fragments."}
          </p>
        </div>
        {isDashboardExpanded ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="inline-flex items-center gap-1 text-xs font-medium text-hub-text-muted hover:text-hub-cyan"
          >
            Collapse
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <motion.div layout className="space-y-4">
        <DropZone onFilesSelected={onFilesSelected} disabled={busy} />
        <ManualResearchForm onSubmitResearch={onManualSubmit} disabled={busy} />
      </motion.div>
    </motion.section>
  );
}
