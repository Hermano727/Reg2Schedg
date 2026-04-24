"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronDown, ChevronUp, HelpCircle, Upload, X } from "lucide-react";
import { DropZone } from "@/components/ingestion/DropZone";

type IngestionHubProps = {
  phase: "idle" | "processing" | "dashboard";
  collapsed: boolean;
  onToggleCollapse: () => void;
  onFilesSelected: (files: FileList | File[]) => void;
  onOpenUploadFormatModal: () => void;
  submissionUsesLeft: number;
  submissionResetsAtLabel: string;
  skipUploadConfirmation: boolean;
  onSkipUploadConfirmationChange: (next: boolean) => Promise<void> | void;
  onManualSubmit: (payload: {
    professor: string;
    course: string;
    quarter: string;
  }) => void;
  classCount: number;
  quarterLabel: string;
  isLocked?: boolean;
};

export function IngestionHub({
  phase,
  collapsed,
  onToggleCollapse,
  onFilesSelected,
  onOpenUploadFormatModal,
  submissionUsesLeft,
  submissionResetsAtLabel,
  skipUploadConfirmation,
  onSkipUploadConfirmationChange,
  classCount,
  quarterLabel,
  isLocked,
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
              onClick={isLocked ? undefined : onToggleCollapse}
              disabled={isLocked}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.1] px-3 text-xs font-medium text-hub-text-secondary transition hover:border-hub-cyan/35 hover:text-hub-cyan disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-white/[0.1] disabled:hover:text-hub-text-secondary"
            >
              <Upload className="h-3.5 w-3.5" />
              {isLocked ? "UCSD verification required" : "Add files"}
            </button>
            <button
              type="button"
              onClick={isLocked ? undefined : onToggleCollapse}
              disabled={isLocked}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.1] text-hub-text-muted hover:text-hub-text disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-hub-text-muted"
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
      className="mb-6"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <h2 className="font-[family-name:var(--font-outfit)] text-xl font-semibold tracking-tight text-hub-text lg:text-[1.45rem]">
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
          <p className="mt-1.5 text-[15px] leading-relaxed text-hub-text-secondary">
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

      <motion.div layout>
        {isLocked ? (
          <div className="rounded-2xl border border-white/[0.08] bg-hub-bg/35 px-6 py-8">
            <div className="max-w-xl rounded-lg border border-hub-gold/30 bg-hub-gold/[0.07] px-4 py-3 text-sm text-hub-text-secondary">
              <p className="font-semibold text-hub-text mb-1">Schedule upload needs UCSD verification</p>
              <p>
                WebReg research uses UCSD-only data sources. Add a verified{" "}
                <span className="text-hub-text">@ucsd.edu</span> address in{" "}
                <Link href="/profile" className="text-hub-cyan underline-offset-2 hover:underline">
                  Profile
                </Link>{" "}
                (Link email), or sign in with Google using an account whose email is{" "}
                <span className="text-hub-text">@ucsd.edu</span>.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a
                href="/signup"
                className="inline-flex items-center gap-2 rounded-lg border border-hub-cyan/30 bg-hub-cyan/[0.08] px-4 py-2 text-sm font-medium text-hub-cyan transition hover:border-hub-cyan/50 hover:bg-hub-cyan/[0.14]"
              >
                Create account
              </a>
              <a
                href="/login"
                className="text-sm font-medium text-hub-text-secondary transition hover:text-hub-text"
              >
                Sign in
              </a>
            </div>
          </div>
        ) : (
          <DropZone
            onFilesSelected={onFilesSelected}
            disabled={busy}
            submissionUsesLeft={submissionUsesLeft}
            submissionResetsAtLabel={submissionResetsAtLabel}
            onOpenUploadFormatModal={onOpenUploadFormatModal}
            skipUploadConfirmation={skipUploadConfirmation}
            onSkipUploadConfirmationChange={onSkipUploadConfirmationChange}
          />
        )}
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
            <Image
              src="/images/print_schedule_help.png"
              alt="Screenshot showing the WebReg print flow to save your schedule as a PDF"
              width={1280}
              height={720}
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
