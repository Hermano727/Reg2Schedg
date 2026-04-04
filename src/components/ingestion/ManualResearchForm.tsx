"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, FlaskConical } from "lucide-react";

type ManualResearchFormProps = {
  onSubmitResearch: (payload: {
    professor: string;
    course: string;
    quarter: string;
  }) => void;
  disabled?: boolean;
};

export function ManualResearchForm({
  onSubmitResearch,
  disabled,
}: ManualResearchFormProps) {
  const [open, setOpen] = useState(false);
  const [professor, setProfessor] = useState("");
  const [course, setCourse] = useState("");
  const [quarter, setQuarter] = useState("Spring 2026");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!professor.trim() || !course.trim() || disabled) return;
    onSubmitResearch({
      professor: professor.trim(),
      course: course.trim(),
      quarter,
    });
  };

  return (
    <div className="rounded-xl border border-white/[0.08] bg-hub-surface/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-white/[0.02]"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-medium text-hub-text">
          <FlaskConical className="h-4 w-4 text-hub-cyan" aria-hidden />
          Research manually
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-hub-text-muted" />
        ) : (
          <ChevronDown className="h-4 w-4 text-hub-text-muted" />
        )}
      </button>
      {open ? (
        <form
          onSubmit={handleSubmit}
          className="space-y-3 border-t border-white/[0.06] p-4 pt-3"
        >
          <p className="text-xs text-hub-text-muted">
            Queue a dossier before you enroll—same synthesis pipeline as file
            ingestion.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs font-medium text-hub-text-secondary">
              Professor
              <input
                value={professor}
                onChange={(e) => setProfessor(e.target.value)}
                placeholder="e.g. Pasquale"
                className="mt-1 h-9 w-full rounded-lg border border-white/[0.08] bg-hub-bg/60 px-2 text-sm text-hub-text outline-none ring-hub-cyan/30 focus:ring-2"
                disabled={disabled}
              />
            </label>
            <label className="block text-xs font-medium text-hub-text-secondary">
              Course
              <input
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                placeholder="e.g. CSE 120"
                className="mt-1 h-9 w-full rounded-lg border border-white/[0.08] bg-hub-bg/60 px-2 text-sm text-hub-text outline-none ring-hub-cyan/30 focus:ring-2"
                disabled={disabled}
              />
            </label>
            <label className="block text-xs font-medium text-hub-text-secondary">
              Quarter
              <select
                value={quarter}
                onChange={(e) => setQuarter(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-white/[0.08] bg-hub-bg/60 px-2 text-sm text-hub-text outline-none ring-hub-cyan/30 focus:ring-2"
                disabled={disabled}
              >
                <option>Spring 2026</option>
                <option>Winter 2026</option>
                <option>Fall 2025</option>
              </select>
            </label>
          </div>
          <button
            type="submit"
            disabled={disabled}
            className="inline-flex h-9 items-center rounded-lg bg-hub-cyan/15 px-3 text-xs font-semibold text-hub-cyan ring-1 ring-hub-cyan/35 transition hover:bg-hub-cyan/25 disabled:opacity-50"
          >
            Run research
          </button>
        </form>
      ) : null}
    </div>
  );
}
