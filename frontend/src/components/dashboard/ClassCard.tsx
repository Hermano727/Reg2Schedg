"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Info,
  RotateCcw,
  Star,
  Zap,
} from "lucide-react";
import type { ClassDossier, CourseLogistics, DossierEditPatch, EvidenceItem } from "@/types/dossier";
import { ConflictBadge } from "@/components/dashboard/ConflictBadge";
import { InlinePencilField } from "@/components/dashboard/InlinePencilField";
import { getSunsetSummary } from "@/lib/mappers/courseEntryToDossier";
import { isExamSection } from "@/lib/mappers/dossiersToScheduleItems";

function isDossierRemoteOnly(dossier: ClassDossier): boolean {
  const regular = dossier.meetings.filter((m) => !isExamSection(m.section_type));
  return regular.length > 0 && regular.every((m) => m.geocode_status === "remote");
}

type ClassCardProps = {
  dossier: ClassDossier;
  isSelected?: boolean;
  markerIndex?: number;
  onSelect?: () => void;
  onHover?: () => void;
  onHoverEnd?: () => void;
  onOpenDashboard?: () => void;
  /** Called when user manually corrects a field. Changes are held in the workspace state until plan is saved. */
  onUpdate?: (patch: DossierEditPatch) => void;
  /** When true, expanded view exposes inline editable fields. */
  isEditable?: boolean;
};

// ── Confidence bar color based on percentage ──────────────────────────────────
function confidenceColor(pct: number): string {
  if (pct <= 30) return "#ff6b6b";
  if (pct <= 70) return "#e3b12f";
  return "#00d4ff";
}

function confidenceGlow(pct: number): string {
  if (pct <= 30) return "0 0 8px rgba(255,107,107,0.45)";
  if (pct <= 70) return "0 0 8px rgba(227,177,47,0.45)";
  return "0 0 8px rgba(0,212,255,0.45)";
}

// ── Stripe-style dot badge (no heavy pill border) ────────────────────────────
type AttrChip = { label: string; tone: "amber" | "green" | "muted" };

const DOT_COLOR: Record<AttrChip["tone"], string> = {
  amber: "bg-amber-400",
  green: "bg-emerald-400",
  muted: "bg-white/20",
};

const LABEL_COLOR: Record<AttrChip["tone"], string> = {
  amber: "text-amber-300/90",
  green: "text-emerald-300/90",
  muted: "text-white/50",
};

function DotBadge({ chip }: { chip: AttrChip }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${LABEL_COLOR[chip.tone]}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_COLOR[chip.tone]}`} />
      {chip.label}
    </span>
  );
}

function AttributeChips({ logistics }: { logistics: CourseLogistics | undefined }) {
  if (!logistics) return null;

  const chips: AttrChip[] = [];

  if (logistics.textbook_required === true)
    chips.push({ label: "Textbook required", tone: "amber" });
  else if (logistics.textbook_required === false)
    chips.push({ label: "No textbook", tone: "muted" });

  if (logistics.attendance_required === true)
    chips.push({ label: "Attendance mandatory", tone: "amber" });
  else if (logistics.attendance_required === false)
    chips.push({ label: "Attendance optional", tone: "muted" });

  if (logistics.podcasts_available === true)
    chips.push({ label: "Podcasts available", tone: "green" });
  else if (logistics.podcasts_available === false)
    chips.push({ label: "No podcasts", tone: "muted" });

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {chips.map((c) => <DotBadge key={c.label} chip={c} />)}
    </div>
  );
}

// ── Source / Quote card ───────────────────────────────────────────────────────
function SourceCard({ quote }: { quote: { id: string; source: string; text: string } }) {
  return (
    <blockquote className="rounded-xl border border-white/[0.06] bg-hub-bg/30 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium text-hub-text-muted/70">
          {quote.source}
        </p>
      </div>
      <p className="text-sm leading-relaxed text-hub-text-secondary">
        &ldquo;{sanitizeDashes(quote.text)}&rdquo;
      </p>
    </blockquote>
  );
}

function SkeletonSourceCard() {
  return (
    <div className="animate-pulse rounded-xl border border-white/[0.06] bg-hub-bg/20 p-4">
      <div className="mb-3 h-2.5 w-24 rounded bg-white/[0.08]" />
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-white/[0.05]" />
        <div className="h-3 w-4/5 rounded bg-white/[0.05]" />
        <div className="h-3 w-3/5 rounded bg-white/[0.05]" />
      </div>
    </div>
  );
}

function EmptyFeedback({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/[0.08] p-8 text-center text-sm text-hub-text-muted">
      {label}
    </div>
  );
}

// ── Evidence card with clickable source link ──────────────────────────────────
const SOURCE_COLORS: Record<string, string> = {
  reddit: "text-orange-400",
  syllabus: "text-emerald-400",
  course: "text-hub-cyan",
  rmp: "text-hub-gold",
};

function sourceColor(source: string): string {
  const lower = source.toLowerCase();
  if (lower.includes("reddit")) return SOURCE_COLORS.reddit;
  if (lower.includes("syllabus")) return SOURCE_COLORS.syllabus;
  if (lower.includes("course") || lower.includes("prof")) return SOURCE_COLORS.course;
  if (lower.includes("rmp") || lower.includes("rate")) return SOURCE_COLORS.rmp;
  return "text-hub-text-muted";
}

function EvidenceCard({ item }: { item: EvidenceItem }) {
  return (
    <blockquote className="rounded-xl border border-white/[0.06] bg-hub-bg/30 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className={`text-[10px] font-semibold ${sourceColor(item.source)}`}>
          {item.source}
        </p>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] text-hub-text-muted transition hover:border-hub-cyan/40 hover:text-hub-cyan"
          >
            Source <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>
      <p className="text-sm leading-relaxed text-hub-text-secondary">
        &ldquo;{sanitizeDashes(item.content)}&rdquo;
      </p>
      {item.relevance_score != null && (
        <div className="mt-2 flex items-center gap-1.5">
          <div className="h-0.5 flex-1 overflow-hidden rounded-full bg-hub-bg/80">
            <div
              className="h-full rounded-full bg-hub-cyan/40"
              style={{ width: `${Math.round(item.relevance_score * 100)}%` }}
            />
          </div>
          <span className="text-[9px] text-hub-text-muted">
            {Math.round(item.relevance_score * 100)}% relevant
          </span>
        </div>
      )}
    </blockquote>
  );
}


// ── Grade breakdown table ──────────────────────────────────────────────────────
type GradeRow = { component: string; weight: string };

function parseGradeBreakdown(breakdown: string): GradeRow[] {
  return breakdown
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((seg) => {
      // Match "Homework 20%" or "20% Homework" patterns
      const pctFirst = seg.match(/^(\d+(?:\.\d+)?%)\s+(.+)$/);
      if (pctFirst) return { weight: pctFirst[1], component: pctFirst[2] };
      const pctLast = seg.match(/^(.+?)\s+(\d+(?:\.\d+)?%)$/);
      if (pctLast) return { component: pctLast[1], weight: pctLast[2] };
      return { component: seg, weight: "" };
    });
}

function GradeBreakdownTable({ breakdown }: { breakdown: string | null | undefined }) {
  if (!breakdown) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-white/[0.06] px-3 py-2">
        <Info className="h-3 w-3 shrink-0 text-hub-text-muted/50" />
        <span className="text-[10px] text-hub-text-muted">Grading breakdown not found</span>
      </div>
    );
  }

  const rows = parseGradeBreakdown(breakdown);

  return (
    <div className="rounded-lg border border-white/[0.06] bg-hub-bg/20 px-3 py-2">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-white/50">Grading</p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            <th className="pb-1 text-left text-[10px] font-medium uppercase tracking-wide text-white/30">Component</th>
            <th className="pb-1 text-right text-[10px] font-medium uppercase tracking-wide text-white/30">Weight</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-white/[0.04] last:border-0">
              <td className="py-1 pr-4 text-hub-text-secondary">{row.component}</td>
              <td className="py-1 text-right font-[family-name:var(--font-jetbrains-mono)] text-hub-cyan tabular-nums">
                {row.weight || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Inline evidence quote for card view ───────────────────────────────────────
function InlineQuote({ item }: { item: EvidenceItem }) {
  const truncated =
    item.content.length > 110 ? item.content.slice(0, 108).trimEnd() + "…" : item.content;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-white/[0.05] bg-hub-bg/20 px-2.5 py-2">
      <span className={`mt-px text-xs font-bold ${sourceColor(item.source)}`}>
        &ldquo;
      </span>
      <p className="flex-1 text-xs leading-relaxed text-hub-text-secondary">
        {sanitizeDashes(truncated)}
      </p>
      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={item.source}
          className="mt-0.5 shrink-0 text-white/40 transition hover:text-hub-cyan"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

// ── Fixed 4-group grade preview for card view ─────────────────────────────────
// Always renders exactly A / B / C / D·F — fixed viewBox so every card is identical.
const CARD_GRADE_GROUPS = [
  { label: "A",   grades: ["A+","A","A-"],        color: "#21c1df" },
  { label: "B",   grades: ["B+","B","B-"],        color: "#4f8dfd" },
  { label: "C",   grades: ["C+","C","C-"],        color: "#a78bfa" },
  { label: "D/F", grades: ["D+","D","D-","F"],    color: "#ff5578" },
] as const;

// Fixed SVG dimensions — always identical regardless of data
const CG_BAR_W = 38;
const CG_GAP   = 10;
const CG_BAR_H = 56;
const CG_LABEL_H = 14;
const CG_PCT_H   = 13;
const CG_SVG_W = CARD_GRADE_GROUPS.length * (CG_BAR_W + CG_GAP) - CG_GAP; // 194
const CG_SVG_H = CG_PCT_H + CG_BAR_H + CG_LABEL_H;                        // 83

function GradeHistogram({
  gradeCounts,
  sampleSize,
}: {
  gradeCounts: Record<string, number>;
  sampleSize: number;
}) {
  if (!sampleSize) return null;

  const groups = CARD_GRADE_GROUPS.map((g) => {
    const count = g.grades.reduce((s, gr) => s + (gradeCounts[gr] ?? 0), 0);
    return { label: g.label, color: g.color, count, pct: (count / sampleSize) * 100 };
  });

  const maxPct = Math.max(...groups.map((g) => g.pct), 1);
  const hasAny = groups.some((g) => g.count > 0);
  if (!hasAny) return null;

  return (
    <div className="rounded-lg border border-white/[0.06] bg-hub-bg/20 px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
          Grade distribution
        </p>
        <span className="text-[9px] text-white/30">{sampleSize} students</span>
      </div>
      <svg
        viewBox={`0 0 ${CG_SVG_W} ${CG_SVG_H}`}
        width={CG_SVG_W}
        height={CG_SVG_H}
        aria-label="Grade distribution preview"
        className="block"
      >
        {groups.map((g, i) => {
          const barH = Math.max((g.pct / maxPct) * CG_BAR_H, g.count > 0 ? 3 : 0);
          const x = i * (CG_BAR_W + CG_GAP);
          const barY = CG_PCT_H + (CG_BAR_H - barH);
          const pctLabel = g.pct >= 1 ? `${Math.round(g.pct)}%` : "";
          return (
            <g key={g.label}>
              {pctLabel && (
                <text
                  x={x + CG_BAR_W / 2}
                  y={barY - 3}
                  textAnchor="middle"
                  fontSize={7}
                  fontWeight={700}
                  fill={g.color}
                  fillOpacity={0.9}
                >
                  {pctLabel}
                </text>
              )}
              <rect
                x={x} y={barY}
                width={CG_BAR_W} height={barH}
                fill={g.color} fillOpacity={0.8} rx={3}
              >
                <title>{g.label}: {Math.round(g.pct)}% ({g.count} students)</title>
              </rect>
              <text
                x={x + CG_BAR_W / 2}
                y={CG_SVG_H - 2}
                textAnchor="middle"
                fontSize={8}
                fill="rgba(148,163,184,0.85)"
              >
                {g.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Main ClassCard ────────────────────────────────────────────────────────────
export function ClassCard({
  dossier,
  isSelected,
  markerIndex,
  onSelect,
  onHover,
  onHoverEnd,
  onOpenDashboard,
  onUpdate,
  isEditable = false,
}: ClassCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const rmp = dossier.logistics?.rate_my_professor;
  const sunsetSummary = getSunsetSummary(dossier.sunsetGradeDistribution);
  const sunsetSampleSize =
    sunsetSummary?.sample_size ??
    Object.values(sunsetSummary?.grade_counts ?? {}).reduce(
      (sum, count) => sum + count,
      0,
    );
  const hasSunsetSummary =
    sunsetSummary?.average_gpa != null ||
    sunsetSummary?.sample_size != null ||
    Object.keys(sunsetSummary?.grade_counts ?? {}).length > 0 ||
    dossier.sunsetGradeDistribution?.recommend_professor_percent != null;
  const hasRmp =
    rmp &&
    (rmp.rating != null ||
      rmp.difficulty != null ||
      rmp.would_take_again_percent != null);

  // Evidence items sorted by relevance score descending
  const allEvidence = [...(dossier.logistics?.evidence ?? [])].sort(
    (a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0),
  );
  const topEvidence = allEvidence[0] ?? null;
  const professorInfoFound = dossier.logistics?.professor_info_found !== false;
  const hasAnyEvidence = allEvidence.length > 0;

  const confColor = confidenceColor(dossier.confidencePercent);
  const confGlow = confidenceGlow(dossier.confidencePercent);
  const reduce = useReducedMotion();

  return (
    <>
      <motion.article
        layout
        variants={reduce ? undefined : {
          hidden: { opacity: 0, y: 10 },
          visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
        }}
        whileHover={reduce ? undefined : { y: -2, transition: { duration: 0.15, ease: "easeOut" } }}
        onMouseEnter={onHover}
        onMouseLeave={onHoverEnd}
        onClick={onSelect}
        className={`rounded-xl border bg-hub-surface/90 p-4 shadow-sm transition-colors duration-200 cursor-pointer active:scale-[0.98]
          ${
            isSelected
              ? "border-hub-cyan/60 shadow-[0_0_0_1px_rgba(0,212,255,0.12),0_8px_32px_rgba(0,212,255,0.08)]"
              : "border-white/[0.08] hover:border-white/[0.14]"
          }`}
      >
        {/* ── Card Header ── */}
        <header className="border-b border-white/[0.06] pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="flex flex-wrap items-baseline gap-1.5 font-[family-name:var(--font-outfit)] text-base font-semibold tracking-tight text-hub-text">
                {dossier.courseCode}
                {markerIndex != null ? (
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-hub-cyan/40 bg-hub-cyan/10 text-[10px] font-bold text-hub-cyan leading-none">
                    {markerIndex}
                  </span>
                ) : isDossierRemoteOnly(dossier) ? (
                  <span className="inline-flex items-center rounded-full border border-purple-400/35 bg-purple-400/10 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide text-purple-300 leading-5">
                    Remote
                  </span>
                ) : null}
                <span className="text-hub-text-muted font-normal text-sm">
                  <InlinePencilField
                    value={dossier.courseTitle ?? ""}
                    placeholder="Course title"
                    onSave={(v) => onUpdate?.({ courseTitle: v })}
                  />
                </span>
              </h3>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/[0.1] bg-hub-bg/50 text-[10px] font-semibold text-hub-cyan">
                  {dossier.professorInitials}
                </span>
                <span className="text-sm text-hub-text-secondary">
                  <InlinePencilField
                    value={dossier.professorName ?? ""}
                    placeholder="Professor name"
                    onSave={(v) => onUpdate?.({ professorName: v })}
                  />
                </span>
              </div>
            </div>

            {/* Top-right actions: eye + selected */}
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <div className="flex items-center gap-1.5">
                {isSelected && (
                  <span className="rounded-full border border-hub-cyan/30 bg-hub-cyan/10 px-2 py-0.5 text-[10px] font-semibold text-hub-cyan">
                    Selected
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDashboard?.();
                  }}
                  className="flex items-center gap-1 rounded-lg border border-hub-cyan/30 bg-hub-cyan/10 px-3 py-1.5 text-xs font-semibold text-hub-cyan transition hover:bg-hub-cyan/20 hover:border-hub-cyan/50 hover:-translate-y-[1px] active:scale-[0.98]"
                >
                  Course Details
                  <ChevronRight className="h-3 w-3" aria-hidden />
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="mt-3 space-y-3">
          {/* Attribute chips: Payments / Attendance */}
          <AttributeChips logistics={dossier.logistics} />

          {/* Quick stats row — hero metrics */}
          {(hasRmp || hasSunsetSummary) && (
            <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-hub-bg/30 px-3 py-2.5">
              {hasRmp && rmp.rating != null && (
                <div className="flex flex-col items-center gap-0.5 min-w-[44px]">
                  <div className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 text-hub-gold" fill="currentColor" />
                    <span className="text-base font-bold text-hub-text tabular-nums">
                      {rmp.rating.toFixed(1)}
                    </span>
                  </div>
                  <span className="text-[10px] text-white/50">Rating</span>
                </div>
              )}
              {hasRmp && rmp.difficulty != null && (
                <>
                  <div className="h-6 w-px bg-white/[0.08]" />
                  <div className="flex flex-col items-center gap-0.5 min-w-[44px]">
                    <div className="flex items-center gap-1">
                      <Zap className="h-3.5 w-3.5 text-amber-400" />
                      <span className="text-base font-bold text-hub-text tabular-nums">
                        {rmp.difficulty.toFixed(1)}
                      </span>
                    </div>
                    <span className="text-[10px] text-white/50">Difficulty</span>
                  </div>
                </>
              )}
              {hasRmp && rmp.would_take_again_percent != null && (
                <>
                  <div className="h-6 w-px bg-white/[0.08]" />
                  <div className="flex flex-col items-center gap-0.5 min-w-[44px]">
                    <div className="flex items-center gap-1">
                      <RotateCcw className="h-3 w-3 text-emerald-400" />
                      <span className="text-base font-bold text-hub-text tabular-nums">
                        {Math.round(rmp.would_take_again_percent)}%
                      </span>
                    </div>
                    <span className="text-[10px] text-white/50">Retake</span>
                  </div>
                </>
              )}
              {hasSunsetSummary && sunsetSummary?.average_gpa != null && (
                <>
                  <div className="h-6 w-px bg-white/[0.08]" />
                  <div className="ml-auto flex flex-col items-center gap-0.5 min-w-[44px]">
                    <span className="text-base font-bold text-hub-cyan tabular-nums">
                      {sunsetSummary.average_gpa}
                    </span>
                    <span className="text-[10px] text-white/50">
                      {dossier.sunsetGradeDistribution?.is_cross_course_fallback ? "Other GPA*" : "Avg GPA"}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Grade distribution histogram */}
          {sunsetSampleSize > 0 && Object.keys(sunsetSummary?.grade_counts ?? {}).length > 0 && (
            <GradeHistogram gradeCounts={sunsetSummary?.grade_counts ?? {}} sampleSize={sunsetSampleSize} />
          )}

          {/* Grade breakdown is shown in expanded view below */}

          {/* No professor info notice */}
          {!professorInfoFound && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-900/10 px-3 py-2">
              <Info className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/70" />
              <p className="text-[11px] leading-relaxed text-amber-300/70">
                No specific professor info found — showing general course & faculty overview below.
              </p>
            </div>
          )}

          {/* Cross-course SunSET fallback notice */}
          {dossier.sunsetGradeDistribution?.is_cross_course_fallback && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/15 bg-amber-900/8 px-3 py-2">
              <Info className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/60" />
              <p className="text-[10px] leading-relaxed text-amber-300/60">
                Grade data from{" "}
                <span className="font-semibold">
                  {dossier.sunsetGradeDistribution.source_course_code ?? "another course"}
                </span>{" "}
                — {dossier.professorName} has not taught {dossier.courseCode} before.
              </p>
            </div>
          )}

          {/* TLDR / student sentiment */}
          {dossier.tldr && (
            <p className="text-[13px] leading-relaxed text-hub-text-secondary line-clamp-2">
              {dossier.tldr}
            </p>
          )}

          {/* Top evidence quote with source link */}
          {topEvidence && (
            <InlineQuote item={topEvidence} />
          )}

          {/* "Open Insights" nudge if evidence available */}
          {hasAnyEvidence && allEvidence.length > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenDashboard?.(); }}
              className="flex items-center gap-1 text-[10px] text-hub-cyan/60 transition hover:text-hub-cyan"
            >
              <BookOpen className="h-3 w-3" />
              {allEvidence.length - 1} more source{allEvidence.length > 2 ? "s" : ""} →
            </button>
          )}

          {dossier.conflict ? <ConflictBadge conflict={dossier.conflict} /> : null}

          {/* ── Expand / collapse toggle ── */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setIsExpanded((v) => !v); }}
            className="flex w-full items-center justify-center gap-1 rounded-md py-1 text-[10px] font-medium text-white/30 transition hover:text-white/60"
          >
            {isExpanded ? "Less" : "More details"}
            <motion.span animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="h-3 w-3" />
            </motion.span>
          </button>

          {/* ── Expanded panel ── */}
          <AnimatePresence initial={false}>
            {isExpanded && (
              <motion.div
                key="expanded"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="space-y-3 pt-1" onClick={(e) => e.stopPropagation()}>
                  {/* Grade breakdown table */}
                  {dossier.logistics != null && (
                    isEditable ? (
                      <div className="rounded-lg border border-white/[0.06] bg-hub-bg/20 px-3 py-2">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-white/50">Grading</p>
                        <input
                          className="w-full rounded border border-white/[0.1] bg-hub-bg/40 px-2 py-1 text-sm text-hub-text-secondary outline-none focus:border-hub-cyan/50"
                          value={dossier.logistics.grade_breakdown ?? ""}
                          placeholder="e.g. Homework 30%, Midterm 30%, Final 40%"
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => onUpdate?.({ logistics: { grade_breakdown: e.target.value || null } })}
                        />
                      </div>
                    ) : (
                      <GradeBreakdownTable breakdown={dossier.logistics.grade_breakdown} />
                    )
                  )}

                  {/* Second evidence quote */}
                  {allEvidence[1] && <InlineQuote item={allEvidence[1]} />}

                  {/* Building/location info */}
                  {dossier.meetings.filter((m) => m.location && m.geocode_status === "resolved").slice(0, 2).map((m, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px] text-hub-text-muted">
                      <span className="h-1.5 w-1.5 rounded-full bg-hub-cyan/50" />
                      {m.location}
                      {m.days && <span className="text-white/30">· {m.days}</span>}
                    </div>
                  ))}

                  {/* Editable attribute toggles */}
                  {isEditable && dossier.logistics && (
                    <div className="flex flex-wrap gap-3">
                      {(["attendance_required", "textbook_required", "podcasts_available"] as const).map((field) => {
                        const val = dossier.logistics![field];
                        const labels: Record<string, [string, string]> = {
                          attendance_required: ["Attendance mandatory", "Attendance optional"],
                          textbook_required: ["Textbook required", "No textbook"],
                          podcasts_available: ["Podcasts available", "No podcasts"],
                        };
                        const [trueLabel, falseLabel] = labels[field];
                        const next = val === true ? false : val === false ? null : true;
                        return (
                          <button
                            key={field}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onUpdate?.({ logistics: { [field]: next } }); }}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition
                              ${val === true ? "border-amber-500/30 bg-amber-900/20 text-amber-300" : val === false ? "border-white/[0.08] bg-white/[0.03] text-white/40" : "border-dashed border-white/[0.1] text-white/30"}`}
                          >
                            {val === true ? trueLabel : val === false ? falseLabel : "Unknown"}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.article>

    </>
  );
}

// ── Helpers & data ────────────────────────────────────────────────────────────

function sanitizeDashes(input: string) {
  if (!input) return input;
  return input.replace(/[–—]|--/g, ":");
}

const SUNSET_SEGMENT_COLORS: Record<string, string> = {
  "A+": "#21c1df",
  "A": "#20b6d9",
  "A-": "#1599cb",
  "B+": "#6ca8ff",
  "B": "#4f8dfd",
  "B-": "#386fda",
  "C+": "#a78bfa",
  "C": "#8b5cf6",
  "C-": "#7c3aed",
  "D+": "#ff7b94",
  "D": "#ff6281",
  "D-": "#ff5578",
  "F": "#ff4169",
  "P": "#7dd3fc",
  "NP": "#94a3b8",
  "S": "#67e8f9",
  "U": "#a78bfa",
  "W": "#64748b",
  "EW": "#475569",
  "I": "#334155",
};
