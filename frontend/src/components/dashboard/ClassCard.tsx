"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, HelpCircle, RotateCcw, Star, Zap } from "lucide-react";
import type { ClassDossier } from "@/types/dossier";
import { ConflictBadge } from "@/components/dashboard/ConflictBadge";
import { StatusChips } from "@/components/dashboard/StatusChips";

type ClassCardProps = {
  dossier: ClassDossier;
};

export function ClassCard({ dossier }: ClassCardProps) {
  const [tab, setTab] = useState<"summary" | "raw">("summary");
  const [showConfidenceInfo, setShowConfidenceInfo] = useState(false);

  const rmp = dossier.logistics?.rate_my_professor;
  const hasRmp =
    rmp &&
    (rmp.rating != null ||
      rmp.difficulty != null ||
      rmp.would_take_again_percent != null);

  return (
    <motion.article
      layout
      className="rounded-xl border border-white/[0.08] bg-hub-surface/90 p-4 shadow-sm"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] pb-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-hub-text-muted">
            Course summary
          </p>
          <h3 className="mt-1 font-[family-name:var(--font-outfit)] text-lg font-semibold tracking-tight text-hub-text">
            {dossier.courseCode}{" "}
            <span className="text-hub-text-secondary">:</span>{" "}
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
            <div className="flex items-center gap-1.5">
              <span>Data confidence</span>
              <div className="relative">
                <button
                  type="button"
                  onMouseEnter={() => setShowConfidenceInfo(true)}
                  onMouseLeave={() => setShowConfidenceInfo(false)}
                  className="flex items-center text-hub-text-muted/50 transition hover:text-hub-text-muted"
                  aria-label="How is data confidence calculated?"
                >
                  <HelpCircle className="h-3 w-3" />
                </button>
                {showConfidenceInfo && (
                  <div className="absolute bottom-full left-1/2 z-20 mb-2 w-60 -translate-x-1/2 rounded-lg border border-white/[0.12] bg-hub-surface p-3 text-[11px] leading-relaxed text-hub-text-secondary shadow-xl">
                    <p className="mb-1 font-semibold text-hub-text">
                      About this score
                    </p>
                    <p>
                      A weighted average of available data sources: syllabus
                      (highest trust), registrar records, SET surveys, and
                      community sources such as Reddit and RateMyProfessors.
                    </p>
                  </div>
                )}
              </div>
            </div>
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
        </div>

        {tab === "summary" ? (
          <div className="space-y-3">
            {hasRmp && (
              <div className="rounded-xl border border-white/[0.06] bg-hub-bg/30 p-3">
                <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-hub-text-muted">
                  Prof. Ratings
                </p>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  {rmp.rating != null && (
                    <div className="flex items-center gap-1.5">
                      <Star
                        className="h-3.5 w-3.5 text-hub-gold"
                        fill="currentColor"
                      />
                      <span className="text-sm font-semibold text-hub-text">
                        {rmp.rating.toFixed(1)}
                      </span>
                      <span className="text-[11px] text-hub-text-muted">
                        / 5
                      </span>
                    </div>
                  )}
                  {rmp.difficulty != null && (
                    <div className="flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-orange-400" />
                      <span className="text-sm font-semibold text-hub-text">
                        {rmp.difficulty.toFixed(1)}
                      </span>
                      <span className="text-[11px] text-hub-text-muted">
                        difficulty
                      </span>
                    </div>
                  )}
                  {rmp.would_take_again_percent != null && (
                    <div className="flex items-center gap-1.5">
                      <RotateCcw className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-sm font-semibold text-hub-text">
                        {Math.round(rmp.would_take_again_percent)}%
                      </span>
                      <span className="text-[11px] text-hub-text-muted">
                        would retake
                      </span>
                    </div>
                  )}
                  {rmp.url && (
                    <a
                      href={rmp.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto flex items-center gap-1 text-[10px] text-hub-text-muted transition hover:text-hub-cyan"
                    >
                      RMP <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
                {dossier.logistics?.course_webpage_url && (
                  <div className="mt-2 border-t border-white/[0.05] pt-2">
                    <a
                      href={dossier.logistics.course_webpage_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-hub-cyan hover:underline"
                    >
                      Course page <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                )}
              </div>
            )}
            <div className="rounded-xl border border-white/[0.06] bg-hub-bg/35 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-hub-cyan">
                Information
              </p>
              <p className="mt-2 text-sm leading-relaxed text-hub-text-secondary">
                {dossier.tldr}
              </p>
            </div>
            {dossier.condensedSummary.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-hub-text-muted">
                  Logistics
                </p>
                <ul className="mt-2 space-y-1.5 text-sm text-hub-text-secondary">
                  {dossier.condensedSummary.map((line, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-white/[0.08]" aria-hidden />
                      <span>{sanitizeDashes(line)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
                  &ldquo;{sanitizeDashes(q.text)}&rdquo;
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

function sanitizeDashes(input: string) {
  if (!input) return input;
  // Replace em-dash, en-dash, and double-hyphen with a colon for clarity
  return input.replace(/[–—]|--/g, ":");
}
