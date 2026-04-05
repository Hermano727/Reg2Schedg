"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronUp, HelpCircle, Upload, X } from "lucide-react";
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
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (!helpOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHelpOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [helpOpen]);

  if (phase === "dashboard" && collapsed) {
    return (
      <motion.div
        layout
        className="glass-panel mb-4 rounded-xl border border-white/[0.08] p-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-hub-text-muted">
              Schedule
            </p>
            <p className="text-sm text-hub-text">
              <span className="font-[family-name:var(--font-outfit)] font-semibold">
                {quarterLabel}
              </span>
              <span className="text-hub-text-muted"> · </span>
              <span>{classCount} classes loaded</span>
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
              aria-label="Expand schedule panel"
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
          <div className="flex items-center gap-2">
            <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold tracking-tight text-hub-text">
              {isDashboardExpanded ? "Add files" : "Attach your schedule"}
            </h2>
            {!isDashboardExpanded && (
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                className="inline-flex items-center justify-center rounded-md p-1 text-hub-text-muted transition hover:text-hub-cyan"
                aria-label="How to export your WebReg schedule"
              >
                <HelpCircle className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-hub-text-secondary">
            {isDashboardExpanded
              ? "Attach another WebReg export or syllabus to refresh your schedule."
              : "Attach your WebReg schedule to get started. Export a PDF directly from WebReg, take a screenshot, or paste one from your clipboard."}
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

      {helpOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="How to export your WebReg schedule as a PDF"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl border border-white/[0.12] bg-hub-surface p-5 shadow-2xl shadow-black/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <p className="font-[family-name:var(--font-outfit)] text-base font-semibold text-hub-text">
                How to export your WebReg schedule as a PDF
              </p>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="rounded-lg p-1.5 text-hub-text-muted hover:bg-white/5 hover:text-hub-text"
                aria-label="Close help"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <img
              src="/images/print_schedule_help.png"
              alt="Screenshot showing the WebReg print flow to save your schedule as a PDF"
              className="w-full rounded-lg border border-white/[0.08]"
            />
            <p className="mt-3 text-xs leading-relaxed text-hub-text-muted">
              In WebReg, open the print dialog and choose{" "}
              <span className="font-medium text-hub-text-secondary">Save as PDF</span>.
              Then drag that file into the upload area, or use{" "}
              <span className="font-medium text-hub-text-secondary">Browse files</span>.
            </p>
          </div>
        </div>
      )}
    </motion.section>
  );
}
