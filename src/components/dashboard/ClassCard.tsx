"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { ClassDossier } from "@/types/dossier";
import { ConflictBadge } from "@/components/dashboard/ConflictBadge";
import { StatusChips } from "@/components/dashboard/StatusChips";

type ClassCardProps = {
  dossier: ClassDossier;
};

export function ClassCard({ dossier }: ClassCardProps) {
  const [tab, setTab] = useState<"summary" | "raw">("summary");

  return (
    <motion.article
      layout
      className="rounded-xl border border-white/[0.08] bg-hub-surface/90 p-4 shadow-sm"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] pb-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-hub-text-muted">
            Class dossier
          </p>
          <h3 className="mt-1 font-[family-name:var(--font-outfit)] text-lg font-semibold tracking-tight text-hub-text">
            {dossier.courseCode}{" "}
            <span className="text-hub-text-secondary">—</span>{" "}
            {dossier.courseTitle}
          </h3>
          <div className="mt-2 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.1] bg-hub-bg/50 text-xs font-semibold text-hub-cyan">
              {dossier.professorInitials}
            </span>
            <span className="text-sm text-hub-text-secondary">
              Prof. {dossier.professorName}
            </span>
          </div>
        </div>
        <div className="flex rounded-lg border border-white/[0.08] bg-hub-bg/40 p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setTab("summary")}
            className={`rounded-md px-3 py-1.5 transition ${
              tab === "summary"
                ? "bg-hub-surface-elevated text-hub-text shadow-sm"
                : "text-hub-text-muted hover:text-hub-text-secondary"
            }`}
          >
            Summary
          </button>
          <button
            type="button"
            onClick={() => setTab("raw")}
            className={`rounded-md px-3 py-1.5 transition ${
              tab === "raw"
                ? "bg-hub-surface-elevated text-hub-text shadow-sm"
                : "text-hub-text-muted hover:text-hub-text-secondary"
            }`}
          >
            Raw feedback
          </button>
        </div>
      </header>

      <div className="mt-4 space-y-4">
        <StatusChips chips={dossier.chips} />

        <div>
          <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-hub-text-muted">
            <span>Data confidence</span>
            <span className="font-[family-name:var(--font-jetbrains-mono)] text-hub-text-secondary">
              {dossier.confidencePercent}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-hub-bg/80">
            <div
              className="h-full rounded-full bg-hub-cyan/80"
              style={{ width: `${dossier.confidencePercent}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-hub-text-muted">
            Weighted: syllabus → registrar → SET → community sources.
          </p>
        </div>

        {tab === "summary" ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/[0.06] bg-hub-bg/35 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-hub-cyan">
                TL;DR
              </p>
              <p className="mt-2 text-sm leading-relaxed text-hub-text-secondary">
                {dossier.tldr}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-hub-text-muted">
                Action items
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm text-hub-text-secondary">
                {dossier.condensedSummary.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
            {dossier.rawQuotes.map((q) => (
              <blockquote
                key={q.id}
                className="rounded-lg border border-white/[0.06] bg-hub-bg/30 p-3"
              >
                <p className="text-[10px] font-medium uppercase tracking-wide text-hub-text-muted">
                  {q.source}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-hub-text-secondary">
                  “{q.text}”
                </p>
              </blockquote>
            ))}
          </div>
        )}

        {dossier.conflict ? <ConflictBadge conflict={dossier.conflict} /> : null}
      </div>
    </motion.article>
  );
}
