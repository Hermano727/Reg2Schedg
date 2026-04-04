"use client";

import { useCallback, useState } from "react";
import { FileCode, FileImage, FileText, Upload } from "lucide-react";

type DropZoneProps = {
  onFilesSelected: (files: FileList | File[]) => void;
  disabled?: boolean;
};

export function DropZone({ onFilesSelected, disabled }: DropZoneProps) {
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list?.length || disabled) return;
      onFilesSelected(list);
    },
    [disabled, onFilesSelected],
  );

  return (
    <div
      className={`relative rounded-xl border border-dashed px-4 py-10 transition ${
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
        <div className="mb-4 flex gap-3 text-hub-text-muted">
          <FileCode className="h-6 w-6" aria-hidden />
          <FileText className="h-6 w-6" aria-hidden />
          <FileImage className="h-6 w-6" aria-hidden />
        </div>
        <p className="font-[family-name:var(--font-outfit)] text-base font-semibold text-hub-text">
          Drop WebReg HTML, syllabus PDF, or a screenshot
        </p>
        <p className="mt-2 max-w-md text-sm text-hub-text-secondary">
          We parse your schedule and cross-reference SETs, Reddit, and syllabus
          logistics into one dossier per class.
        </p>
        <label
          htmlFor="ingest-input"
          className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.12] bg-hub-surface-elevated px-4 py-2 text-sm font-medium text-hub-text transition hover:border-hub-cyan/35 hover:text-hub-cyan"
        >
          <Upload className="h-4 w-4" />
          Browse files
        </label>
      </div>
    </div>
  );
}
