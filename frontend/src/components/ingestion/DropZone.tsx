"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Clipboard, FileCode, FileImage, FileText, Upload } from "lucide-react";

type DropZoneProps = {
  onFilesSelected: (files: FileList | File[]) => void;
  disabled?: boolean;
};

const DROP_ICONS = [FileCode, FileText, FileImage] as const;

export function DropZone({ onFilesSelected, disabled }: DropZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const reduce = useReducedMotion();

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list?.length || disabled) return;
      onFilesSelected(list);
    },
    [disabled, onFilesSelected],
  );

  // Window-level paste listener — fires automatically when user does Cmd/Ctrl+V
  useEffect(() => {
    if (disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (file) onFilesSelected([file]);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [disabled, onFilesSelected]);

  // Button-triggered paste via Clipboard API (requires clipboard-read permission)
  const handlePasteClick = useCallback(async () => {
    if (disabled) return;
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = new File([blob], "clipboard-image.png", { type: imageType });
          onFilesSelected([file]);
          return;
        }
      }
    } catch {
      // Permission denied or no image in clipboard — user can paste with Ctrl/Cmd+V instead
    }
  }, [disabled, onFilesSelected]);

  return (
    <div
      className={`relative rounded-xl border border-dashed px-6 py-14 transition lg:px-8 lg:py-16 ${
        dragActive
          ? "border-hub-cyan/55 bg-hub-cyan/[0.06]"
          : "border-white/[0.14] bg-hub-bg/30"
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
        handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        id="ingest-input"
        type="file"
        className="sr-only"
        accept=".html,.htm,.pdf,image/*"
        multiple
        disabled={disabled}
        onChange={(e) => handleFiles(e.target.files)}
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
          We'll parse your schedule, cross-reference course evaluations, and
          build a summary for each class.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
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
  );
}
