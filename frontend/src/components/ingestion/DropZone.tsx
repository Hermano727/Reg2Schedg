"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Clipboard, FileCode, FileImage, FileText, Upload, X } from "lucide-react";

type DropZoneProps = {
  onFilesSelected: (files: FileList | File[]) => void;
  disabled?: boolean;
  submissionUsesLeft: number;
  submissionResetsAtLabel: string;
  onOpenUploadFormatModal: () => void;
  skipUploadConfirmation: boolean;
  onSkipUploadConfirmationChange: (next: boolean) => Promise<void> | void;
};

const DROP_ICONS = [FileCode, FileText, FileImage] as const;

export function DropZone({
  onFilesSelected,
  disabled,
  submissionUsesLeft,
  submissionResetsAtLabel,
  onOpenUploadFormatModal,
  skipUploadConfirmation,
  onSkipUploadConfirmationChange,
}: DropZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [skipNextTime, setSkipNextTime] = useState(skipUploadConfirmation);
  const [savingPreference, setSavingPreference] = useState(false);
  const reduce = useReducedMotion();

  const openSubmitConfirmation = useCallback(
    (list: FileList | File[] | null) => {
      if (!list || disabled) return;
      const files = Array.from(list);
      if (files.length === 0) return;
      if (skipUploadConfirmation) {
        onFilesSelected(files);
        return;
      }
      setPendingFiles(files);
      setSkipNextTime(skipUploadConfirmation);
      setConfirmOpen(true);
    },
    [disabled, onFilesSelected, skipUploadConfirmation],
  );

  const closeSubmitConfirmation = useCallback(() => {
    setConfirmOpen(false);
    setPendingFiles(null);
  }, []);

  const handleConfirmSubmit = useCallback(async () => {
    if (!pendingFiles?.length || disabled) return;
    if (skipNextTime !== skipUploadConfirmation) {
      setSavingPreference(true);
      try {
        await onSkipUploadConfirmationChange(skipNextTime);
      } finally {
        setSavingPreference(false);
      }
    }
    onFilesSelected(pendingFiles);
    closeSubmitConfirmation();
  }, [
    closeSubmitConfirmation,
    disabled,
    onFilesSelected,
    onSkipUploadConfirmationChange,
    pendingFiles,
    skipNextTime,
    skipUploadConfirmation,
  ]);

  useEffect(() => {
    if (!confirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSubmitConfirmation();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeSubmitConfirmation, confirmOpen]);

  // Window-level paste listener - fires automatically when user does Cmd/Ctrl+V.
  useEffect(() => {
    if (disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (file) openSubmitConfirmation([file]);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [disabled, openSubmitConfirmation]);

  // Button-triggered paste via Clipboard API (requires clipboard-read permission).
  const handlePasteClick = useCallback(async () => {
    if (disabled) return;
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = new File([blob], "clipboard-image.png", { type: imageType });
          openSubmitConfirmation([file]);
          return;
        }
      }
    } catch {
      // Permission denied or no image in clipboard - user can paste with Ctrl/Cmd+V instead.
    }
  }, [disabled, openSubmitConfirmation]);

  const selectedFileSummary = pendingFiles?.length
    ? `${pendingFiles.length} file${pendingFiles.length === 1 ? "" : "s"} selected`
    : null;
  const usesLabel = submissionUsesLeft === 1 ? "use" : "uses";

  return (
    <>
      <div
        className={`relative rounded-2xl border border-dashed px-6 py-12 transition lg:px-8 lg:py-14 ${
          dragActive
            ? "border-hub-cyan/55 bg-hub-cyan/[0.05]"
            : "border-white/[0.14] bg-white/[0.02]"
        } ${disabled ? "pointer-events-none opacity-50" : ""}`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragActive(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          openSubmitConfirmation(e.dataTransfer.files);
        }}
      >
        <input
          id="ingest-input"
          type="file"
          className="sr-only"
          accept=".html,.htm,.pdf,image/*"
          multiple
          disabled={disabled}
          onChange={(e) => {
            openSubmitConfirmation(e.target.files);
            // Allow selecting the same file again to trigger onChange every time.
            e.currentTarget.value = "";
          }}
        />
        <div className="flex flex-col items-center text-center">
          <div className="mb-5 flex gap-3.5">
            {DROP_ICONS.map((Icon, i) => (
              <motion.div
                key={i}
                animate={!reduce && dragActive
                  ? { y: -4, scale: 1.2, transition: { duration: 0.2, delay: i * 0.06, ease: "easeOut" } }
                  : { y: 0, scale: 1, transition: { duration: 0.2, ease: "easeOut" } }
                }
                className={`transition-colors duration-200 ${dragActive ? "text-hub-cyan" : "text-hub-text-muted"}`}
              >
                <Icon className="h-7 w-7" aria-hidden />
              </motion.div>
            ))}
          </div>
          <p className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-hub-text lg:text-xl">
            Attach your WebReg schedule or syllabi
          </p>
          <p className="mt-2.5 max-w-[680px] text-[15px] leading-relaxed text-hub-text-secondary">
            We&apos;ll parse your schedule, cross-reference course evaluations, and
            build a summary for each class.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <label
              htmlFor="ingest-input"
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.12] bg-hub-surface-elevated px-5 py-2.5 text-[15px] font-medium text-hub-text transition hover:border-hub-cyan/35 hover:text-hub-cyan"
            >
              <Upload className="h-4 w-4" />
              Browse files
            </label>
            <button
              type="button"
              onClick={handlePasteClick}
              disabled={disabled}
              className="inline-flex items-center gap-2 rounded-lg border border-white/[0.12] bg-hub-surface-elevated px-5 py-2.5 text-[15px] font-medium text-hub-text transition hover:border-hub-cyan/35 hover:text-hub-cyan disabled:pointer-events-none disabled:opacity-50"
            >
              <Clipboard className="h-4 w-4" />
              Paste screenshot
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {confirmOpen && (
          <motion.div
            key="dropzone-submit-confirm-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[82] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
            onClick={closeSubmitConfirmation}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-full max-w-lg rounded-2xl border border-white/[0.10] bg-hub-surface-elevated p-6 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-label="Confirm file submission"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={closeSubmitConfirmation}
                className="absolute right-3 top-3 rounded-lg p-1.5 text-hub-text-muted transition hover:bg-white/[0.05] hover:text-hub-text"
                aria-label="Close confirmation"
              >
                <X className="h-4 w-4" />
              </button>

              <p className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-hub-text">
                Make sure your file is correct
              </p>
              <p className="mt-2 text-[15px] leading-relaxed text-hub-text-secondary">
                Make sure your file is of the{" "}
                <button
                  type="button"
                  onClick={onOpenUploadFormatModal}
                  className="font-medium text-hub-cyan underline underline-offset-2 transition hover:text-hub-cyan/80"
                >
                  right format
                </button>{" "}
                before submitting. You have {submissionUsesLeft} {usesLabel} left, which resets at {submissionResetsAtLabel}.
              </p>

              {selectedFileSummary && (
                <p className="mt-3 text-xs text-hub-text-muted">{selectedFileSummary}</p>
              )}

              <div className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-hub-text-secondary">
                  <input
                    type="checkbox"
                    checked={skipNextTime}
                    onChange={(e) => setSkipNextTime(e.target.checked)}
                    className="h-4 w-4 rounded border-white/[0.25] bg-transparent text-hub-cyan focus:ring-hub-cyan/50"
                  />
                  Don&apos;t show this confirmation again
                </label>
                <p className="mt-1 text-xs text-hub-text-muted">
                  Manage this anytime in{" "}
                  <Link href="/profile?section=settings" className="text-hub-cyan underline underline-offset-2 hover:text-hub-cyan/80">
                    profile settings
                  </Link>.
                </p>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={closeSubmitConfirmation}
                  className="rounded-lg border border-white/[0.12] px-4 py-2 text-sm font-medium text-hub-text-secondary transition hover:border-white/[0.18] hover:text-hub-text"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmSubmit()}
                  disabled={disabled || !pendingFiles?.length || savingPreference}
                  className="rounded-lg bg-hub-cyan px-4 py-2 text-sm font-semibold text-hub-bg transition hover:bg-hub-cyan/85 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingPreference ? "Saving..." : "Confirm"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
