"use client";

/**
 * ClassCard — "Split" dossier layout (refactor of the original bento).
 *
 * Key changes vs. the previous card:
 *   • Two-column interior: identity + prof + grading + logistics on the LEFT,
 *     grade distribution + student sentiment on the RIGHT.
 *   • Single consistent section-label style (uppercase 11px, color `--label`).
 *     No more nested bordered boxes.
 *   • All the same data flows, edit affordances, and fallbacks preserved.
 *   • "More details" still expands to expose additional evidence + editable
 *     toggles underneath.
 *
 * All existing props, types, and callbacks are unchanged.
 */

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ChevronDown,
  ExternalLink,
  Info,
  Quote,
} from "lucide-react";
import type {
  ClassDossier,
  CourseLogistics,
  DossierEditPatch,
  EvidenceItem,
  GradeScheme,
} from "@/types/dossier";
import { ConflictBadge } from "@/components/dashboard/ConflictBadge";
import { InlinePencilField } from "@/components/dashboard/InlinePencilField";
import { getSunsetSummary } from "@/lib/mappers/courseEntryToDossier";
import { isExamSection } from "@/lib/mappers/dossiersToScheduleItems";

// ─────────────────────────────────────────────────────────────────────────────
// Types / props
// ─────────────────────────────────────────────────────────────────────────────

type ClassCardProps = {
  dossier: ClassDossier;
  isSelected?: boolean;
  onSelect?: () => void;
  onHover?: () => void;
  onHoverEnd?: () => void;
  /** Called when user manually corrects a field. */
  onUpdate?: (patch: DossierEditPatch) => void;
  /** When true, expanded view exposes inline editable fields. */
  isEditable?: boolean;
  /** Stagger entry animation. */
  entryDelay?: number;
  /** Controlled expanded state. */
  isExpanded?: boolean;
  onToggleExpand?: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared section label
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The ONE section-label treatment used everywhere inside the card. Uppercase,
 * tracked, medium-bright — readable as chrome but clearly not content.
 * (Lifted to ~#B4BECF so non-technical users don't read it as "disabled".)
 */
function SectionLabel({
  children,
  right,
  className = "",
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-2.5 flex items-baseline justify-between gap-3 ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
        {children}
      </span>
      {right != null && (
        <span className="text-[11px] font-[family-name:var(--font-jetbrains-mono)] text-white/45">
          {right}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isDossierRemoteOnly(dossier: ClassDossier): boolean {
  const regular = dossier.meetings.filter((m) => !isExamSection(m.section_type));
  return regular.length > 0 && regular.every((m) => m.geocode_status === "remote");
}

function sanitizeDashes(input: string) {
  if (!input) return input;
  return input.replace(/[–—]|--/g, ":");
}

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
  return "text-white/50";
}

// ─────────────────────────────────────────────────────────────────────────────
// Professor stats — three aligned columns (Rating / Difficulty / Retake)
// ─────────────────────────────────────────────────────────────────────────────

function ProfStats({
  rmp,
  empty,
}: {
  rmp: {
    rating: number | null;
    difficulty: number | null;
    would_take_again_percent: number | null;
    url: string | null;
  } | null;
  empty: string;
}) {
  const has =
    rmp &&
    (rmp.rating != null ||
      rmp.difficulty != null ||
      rmp.would_take_again_percent != null);

  if (!has) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-white/45">
        <span className="h-px w-3 bg-white/20" />
        {empty}
      </div>
    );
  }

  const items: Array<{ k: string; v: string; sub: string; tone: "teal" | "neutral" }> = [];
  if (rmp!.rating != null)
    items.push({ k: "Rating", v: rmp!.rating.toFixed(1), sub: "/ 5.0", tone: "teal" });
  if (rmp!.difficulty != null)
    items.push({ k: "Difficulty", v: rmp!.difficulty.toFixed(1), sub: "/ 5.0", tone: "neutral" });
  if (rmp!.would_take_again_percent != null)
    items.push({
      k: "Retake",
      v: `${Math.round(rmp!.would_take_again_percent)}`,
      sub: "%",
      tone: "neutral",
    });

  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map((it) => (
        <div key={it.k} className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">
            {it.k}
          </span>
          <div className="flex items-baseline gap-1">
            <span
              className={`font-[family-name:var(--font-jetbrains-mono)] text-[22px] leading-none tabular-nums ${it.tone === "teal" ? "text-hub-cyan" : "text-hub-text"
                }`}
              style={{ letterSpacing: "-0.02em" }}
            >
              {it.v}
            </span>
            <span className="font-[family-name:var(--font-jetbrains-mono)] text-[12px] text-white/40">
              {it.sub}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Grade distribution — uses the existing fixed 4-group bar chart, unboxed
// ─────────────────────────────────────────────────────────────────────────────

const CARD_GRADE_GROUPS = [
  { label: "A", grades: ["A+", "A", "A-"], color: "#21c1df" },
  { label: "B", grades: ["B+", "B", "B-"], color: "#4f8dfd" },
  { label: "C", grades: ["C+", "C", "C-"], color: "#a78bfa" },
  { label: "D/F", grades: ["D+", "D", "D-", "F"], color: "#ff5578" },
] as const;

const CG_BAR_W = 40;
const CG_GAP = 12;
const CG_BAR_H = 72;
const CG_LABEL_H = 16;
const CG_PCT_H = 14;
const CG_SVG_W = CARD_GRADE_GROUPS.length * (CG_BAR_W + CG_GAP) - CG_GAP;
const CG_SVG_H = CG_PCT_H + CG_BAR_H + CG_LABEL_H;

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
  if (!groups.some((g) => g.count > 0)) return null;

  return (
    <svg
      viewBox={`0 0 ${CG_SVG_W} ${CG_SVG_H}`}
      width="100%"
      height={CG_SVG_H}
      preserveAspectRatio="xMidYMid meet"
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
                y={barY - 4}
                textAnchor="middle"
                fontSize={9}
                fontWeight={600}
                fill={g.color}
                fillOpacity={0.85}
                fontFamily="var(--font-jetbrains-mono)"
              >
                {pctLabel}
              </text>
            )}
            <rect
              x={x}
              y={barY}
              width={CG_BAR_W}
              height={barH}
              fill={g.color}
              fillOpacity={0.78}
              rx={3}
            >
              <title>
                {g.label}: {Math.round(g.pct)}% ({g.count} students)
              </title>
            </rect>
            <text
              x={x + CG_BAR_W / 2}
              y={CG_SVG_H - 3}
              textAnchor="middle"
              fontSize={10}
              fill="rgba(180,190,207,0.9)"
              fontFamily="var(--font-jetbrains-mono)"
            >
              {g.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Attribute chips (logistics) — as a clean 3-column key/value strip, not pills
// ─────────────────────────────────────────────────────────────────────────────

function LogisticsStrip({ logistics }: { logistics: CourseLogistics | undefined }) {
  if (!logistics) return null;
  const rows: Array<{ k: string; v: string; tone: "on" | "off" | "unknown" }> = [];

  const resolve = (
    label: string,
    val: boolean | null | undefined,
    onLabel: string,
    offLabel: string,
  ) => {
    if (val === true) rows.push({ k: label, v: onLabel, tone: "on" });
    else if (val === false) rows.push({ k: label, v: offLabel, tone: "off" });
    else rows.push({ k: label, v: "Unknown", tone: "unknown" });
  };

  resolve("Textbook", logistics.textbook_required, "Required", "None");
  resolve("Attendance", logistics.attendance_required, "Required", "Optional");
  resolve("Podcasts", logistics.podcasts_available, "Available", "Not recorded");

  return (
    <div className="grid grid-cols-3 gap-3">
      {rows.map((r) => (
        <div key={r.k} className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">
            {r.k}
          </span>
          <span
            className={`text-[12.5px] ${r.tone === "on"
                ? "text-hub-text"
                : r.tone === "off"
                  ? "text-white/55"
                  : "text-white/40"
              }`}
          >
            {r.v}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Grading breakdown — Stripe-style label/value rows (re-uses GradeScheme shape)
// ─────────────────────────────────────────────────────────────────────────────

type GradeRow = { component: string; weight: string };
type GradingScheme = { label: string | null; rows: GradeRow[] };

function parseGradeRows(segment: string): GradeRow[] {
  return segment
    .split(/,/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((seg) => {
      const pctFirst = seg.match(/^(\d+(?:\.\d+)?%)\s+(.+)$/);
      if (pctFirst) return { weight: pctFirst[1], component: pctFirst[2] };
      const pctLast = seg.match(/^(.+?)\s+(\d+(?:\.\d+)?%)$/);
      if (pctLast) return { component: pctLast[1], weight: pctLast[2] };
      return { component: seg, weight: "" };
    });
}

function rowTotal(rows: GradeRow[]): number {
  return rows.reduce((sum, r) => {
    const m = r.weight.match(/(\d+(?:\.\d+)?)/);
    return sum + (m ? parseFloat(m[1]) : 0);
  }, 0);
}

function parseGradingSchemes(breakdown: string): GradingScheme[] {
  const parenOrMatch = breakdown.match(/^(.+?)\s*\(\s*or\s+(.+)\)\s*$/i);
  if (parenOrMatch) {
    const [, mainPart, altPart] = parenOrMatch;
    if (mainPart.includes("%") && altPart.includes("%")) {
      return [
        { label: "Standard", rows: parseGradeRows(mainPart) },
        { label: "Alternate", rows: parseGradeRows(altPart) },
      ];
    }
  }
  for (const sep of [/ OR /i, / \| /, / \/ /]) {
    const parts = breakdown.split(sep).map((s) => s.trim()).filter((p) => p.includes("%"));
    if (parts.length >= 2) {
      return parts.map((p, i) => ({
        label: parts.length === 2 ? (i === 0 ? "Standard" : "Alternate") : `Option ${i + 1}`,
        rows: parseGradeRows(p),
      }));
    }
  }
  const semiParts = breakdown.split(/;\s*/).map((s) => s.trim()).filter((p) => p.includes("%"));
  if (semiParts.length >= 2) {
    return semiParts.map((p, i) => ({
      label: semiParts.length === 2 ? (i === 0 ? "Standard" : "Alternate") : `Option ${i + 1}`,
      rows: parseGradeRows(p),
    }));
  }
  const allRows = parseGradeRows(breakdown);
  const total = rowTotal(allRows);
  if (total > 130 && allRows.length >= 4) {
    let cumsum = 0;
    let splitIdx = allRows.length;
    for (let i = 0; i < allRows.length; i++) {
      const m = allRows[i].weight.match(/(\d+(?:\.\d+)?)/);
      cumsum += m ? parseFloat(m[1]) : 0;
      if (cumsum >= 90) {
        splitIdx = i + 1;
        break;
      }
    }
    if (splitIdx > 0 && splitIdx < allRows.length) {
      return [
        { label: "Standard", rows: allRows.slice(0, splitIdx) },
        { label: "Alternate", rows: allRows.slice(splitIdx) },
      ];
    }
  }
  return [{ label: null, rows: allRows }];
}

function SchemeRows({ rows }: { rows: GradeRow[] }) {
  return (
    <div className="flex flex-col">
      {rows.map((row, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_auto] items-center border-b border-white/[0.05] py-1.5 text-[13px] last:border-0"
        >
          <span className="text-hub-text-secondary">{row.component}</span>
          <span className="font-[family-name:var(--font-jetbrains-mono)] tabular-nums text-hub-text">
            {row.weight || "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

function GradingSection({
  schemes: structuredSchemes,
  breakdown,
}: {
  schemes?: GradeScheme[] | null;
  breakdown?: string | null;
}) {
  const [schemeIdx, setSchemeIdx] = useState(0);

  const schemes: GradingScheme[] =
    structuredSchemes && structuredSchemes.length > 0
      ? structuredSchemes
      : breakdown
        ? parseGradingSchemes(breakdown)
        : [];

  if (schemes.length === 0 || schemes.every((s) => s.rows.length === 0)) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-white/45">
        <Info className="h-3 w-3" />
        Grading breakdown not found
      </div>
    );
  }

  const displaySchemes = schemes.slice(0, 2);
  const hasMore = schemes.length > 2;
  const isMulti = displaySchemes.length > 1;
  const activeScheme = displaySchemes[Math.min(schemeIdx, displaySchemes.length - 1)];

  return (
    <div>
      {isMulti && (
        <div className="mb-2 flex items-center gap-0.5 rounded-md border border-white/[0.08] bg-white/[0.03] p-0.5 w-fit">
          {displaySchemes.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSchemeIdx(i);
              }}
              className={`rounded px-2 py-0.5 text-[10px] font-semibold transition ${schemeIdx === i
                  ? "bg-hub-cyan/15 text-hub-cyan"
                  : "text-white/40 hover:text-white/70"
                }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <SchemeRows rows={activeScheme?.rows ?? []} />
      {hasMore && (
        <p className="mt-2 text-[10px] text-white/40">
          Additional grading options available — open Full View.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sentiment — summary paragraph + a single top-relevance quote card
// ─────────────────────────────────────────────────────────────────────────────

function SentimentBlock({
  tldr,
  topEvidence,
}: {
  tldr: string | null | undefined;
  topEvidence: EvidenceItem | null;
}) {
  if (!tldr && !topEvidence) {
    return (
      <div className="text-[12.5px] text-white/45">
        Not enough student discussion yet to summarize.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tldr && (
        <p
          className="text-[14px] leading-relaxed text-hub-text-secondary"
          style={{ textWrap: "pretty" }}
        >
          {tldr}
        </p>
      )}
      {topEvidence && (
        <div className="flex items-start gap-2.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
          <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/30" />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span
                className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${sourceColor(
                  topEvidence.source,
                )}`}
              >
                {topEvidence.source}
              </span>
              {topEvidence.url && (
                <a
                  href={topEvidence.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 text-[10px] text-white/40 transition hover:text-hub-cyan"
                >
                  Source <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </div>
            <p className="text-[12.5px] italic leading-snug text-hub-text-secondary">
              &ldquo;{sanitizeDashes(topEvidence.content)}&rdquo;
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main card
// ─────────────────────────────────────────────────────────────────────────────

export function ClassCard({
  dossier,
  isSelected,
  onSelect,
  onHover,
  onHoverEnd,
  onUpdate,
  isEditable = false,
  entryDelay = 0,
  isExpanded: isExpandedProp,
  onToggleExpand,
}: ClassCardProps) {
  const [isExpandedInternal, setIsExpandedInternal] = useState(false);
  const isExpanded = isExpandedProp ?? isExpandedInternal;
  const toggleExpanded = onToggleExpand ?? (() => setIsExpandedInternal((v) => !v));

  const rmp = dossier.logistics?.rate_my_professor ?? null;
  const sunsetSummary = getSunsetSummary(dossier.sunsetGradeDistribution);
  const sunsetSampleSize =
    sunsetSummary?.sample_size ??
    Object.values(sunsetSummary?.grade_counts ?? {}).reduce((sum, count) => sum + count, 0);
  const hasSunset =
    sunsetSampleSize > 0 &&
    Object.keys(sunsetSummary?.grade_counts ?? {}).length > 0;

  const allEvidence = [...(dossier.logistics?.evidence ?? [])].sort(
    (a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0),
  );
  const topEvidence = allEvidence[0] ?? null;
  const professorInfoFound = dossier.logistics?.professor_info_found !== false;
  const isRemoteOnly = isDossierRemoteOnly(dossier);
  const reduce = useReducedMotion();

  return (
    <motion.article
      initial={reduce ? undefined : { opacity: 0, y: 10 }}
      animate={reduce ? undefined : { opacity: 1, y: 0 }}
      transition={
        reduce ? undefined : { duration: 0.32, ease: [0.22, 1, 0.36, 1], delay: entryDelay }
      }
      whileHover={
        reduce
          ? undefined
          : {
            y: -2,
            boxShadow: "0 10px 36px rgba(0,212,255,0.06)",
            transition: { duration: 0.15, ease: "easeOut" },
          }
      }
      onMouseEnter={onHover}
      onMouseLeave={onHoverEnd}
      onClick={onSelect}
      className={`overflow-hidden rounded-2xl border bg-hub-surface/90 shadow-sm transition-colors duration-200 cursor-pointer
        ${isSelected
          ? "border-hub-cyan/60 shadow-[0_0_0_1px_rgba(0,212,255,0.12),0_8px_32px_rgba(0,212,255,0.08)]"
          : "border-white/[0.08] hover:border-white/[0.14]"
        }`}
    >
      {/* ───── Header band ───── */}
      <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          {/* Professor avatar (initials) */}
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-hub-bg/60 text-[11px] font-semibold text-hub-cyan">
            {dossier.professorInitials}
          </span>

          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h3 className="font-[family-name:var(--font-outfit)] text-[17px] font-semibold tracking-tight text-hub-text">
                {dossier.courseCode}
              </h3>
              <span className="text-[13px] text-hub-text-secondary/80">
                <InlinePencilField
                  value={dossier.courseTitle ?? ""}
                  placeholder="Course title"
                  onSave={(v) => onUpdate?.({ courseTitle: v })}
                />
              </span>
              {isRemoteOnly ? (
                <span className="inline-flex items-center rounded-full border border-purple-400/35 bg-purple-400/10 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide text-purple-300">
                  Remote
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 text-[12.5px] text-white/55">
              <InlinePencilField
                value={dossier.professorName ?? ""}
                placeholder="Professor name"
                onSave={(v) => onUpdate?.({ professorName: v })}
              />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {isSelected && (
            <span className="rounded-full border border-hub-cyan/30 bg-hub-cyan/10 px-2 py-0.5 text-[10px] font-semibold text-hub-cyan">
              Selected
            </span>
          )}
          {rmp?.url && (
            <a
              href={rmp.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 rounded-lg border border-white/[0.1] bg-white/[0.02] px-2.5 py-1 text-[11px] text-white/60 transition hover:border-white/[0.2] hover:text-white"
            >
              RMP <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </header>

      {/* ───── Two-column body ───── */}
      <div className="grid grid-cols-1 md:grid-cols-2">
        {/* LEFT — prof stats, grading, logistics */}
        <div className="flex flex-col gap-5 border-b border-white/[0.06] p-5 md:border-b-0 md:border-r">
          <section>
            <SectionLabel right={rmp?.url ? "RateMyProf" : undefined}>
              RateMyProf
            </SectionLabel>
            <ProfStats
              rmp={rmp}
              empty={
                professorInfoFound
                  ? "No RateMyProfessors data available for this instructor."
                  : "No professor data yet — showing general course overview."
              }
            />
          </section>

          <section>
            <SectionLabel>Grading breakdown</SectionLabel>
            {dossier.logistics != null && isEditable ? (
              <input
                className="w-full rounded-md border border-white/[0.1] bg-hub-bg/40 px-2.5 py-1.5 text-[13px] text-hub-text-secondary outline-none focus:border-hub-cyan/50"
                value={dossier.logistics.grade_breakdown ?? ""}
                placeholder="e.g. Homework 30%, Midterm 30%, Final 40%"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) =>
                  onUpdate?.({
                    logistics: { grade_breakdown: e.target.value || null },
                  })
                }
              />
            ) : (
              <GradingSection
                schemes={dossier.logistics?.grade_schemes}
                breakdown={dossier.logistics?.grade_breakdown}
              />
            )}
          </section>

          <section>
            <SectionLabel>Course logistics</SectionLabel>
            <LogisticsStrip logistics={dossier.logistics} />
          </section>
        </div>

        {/* RIGHT — grade distribution, sentiment */}
        <div className="flex flex-col gap-5 p-5">
          <section>
            <SectionLabel
              right={
                hasSunset && sunsetSummary?.average_gpa != null
                  ? `avg GPA ${sunsetSummary.average_gpa}`
                  : hasSunset
                    ? ""
                    : "No prior data"
              }
            >
              Grade distribution
            </SectionLabel>
            {hasSunset ? (
              <GradeHistogram
                gradeCounts={sunsetSummary?.grade_counts ?? {}}
                sampleSize={sunsetSampleSize}
              />
            ) : (
              <div className="flex items-center gap-2 text-[12px] text-white/45">
                <span className="h-px w-3 bg-white/20" />
                GPA distribution not found for this class.
              </div>
            )}
            {dossier.sunsetGradeDistribution?.is_cross_course_fallback && (
              <div className="mt-2 flex items-start gap-2 text-[10.5px] leading-relaxed text-amber-300/70">
                <Info className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/60" />
                <span>
                  Data from{" "}
                  <span className="font-semibold">
                    {dossier.sunsetGradeDistribution.source_course_code ?? "another course"}
                  </span>{" "}
                  — {dossier.professorName} has not taught {dossier.courseCode} before.
                </span>
              </div>
            )}
          </section>

          <section className="flex-1">
            <SectionLabel
              right={allEvidence.length > 0 ? `${allEvidence.length} source${allEvidence.length === 1 ? "" : "s"}` : undefined}
            >
              Student sentiment
            </SectionLabel>
            <SentimentBlock tldr={dossier.tldr} topEvidence={topEvidence} />
          </section>
        </div>
      </div>

      {/* ───── Footer: conflict + more details toggle ───── */}
      <footer className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-2.5">
        <div className="min-w-0 flex-1">
          {dossier.conflict ? <ConflictBadge conflict={dossier.conflict} /> : null}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleExpanded();
          }}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-white/45 transition hover:text-white/75"
        >
          {isExpanded ? "Hide details" : "More details"}
          <motion.span animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="h-3 w-3" />
          </motion.span>
        </button>
      </footer>

      {/* ───── Expanded panel (additional evidence + editable toggles + meetings) ───── */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-white/[0.06] bg-hub-bg/25"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4 px-5 py-4">
              {/* Additional evidence */}
              {allEvidence.length > 1 && (
                <section>
                  <SectionLabel>
                    More sources
                  </SectionLabel>
                  <div className="space-y-2">
                    {allEvidence.slice(1, 3).map((item, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2.5 rounded-md border border-white/[0.05] bg-white/[0.015] px-3 py-2"
                      >
                        <Quote className="mt-0.5 h-3 w-3 shrink-0 text-white/25" />
                        <div className="min-w-0 flex-1">
                          <div className="mb-0.5 flex items-center justify-between gap-2">
                            <span
                              className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${sourceColor(
                                item.source,
                              )}`}
                            >
                              {item.source}
                            </span>
                            {item.url && (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1 text-[10px] text-white/35 transition hover:text-hub-cyan"
                              >
                                <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            )}
                          </div>
                          <p className="text-[12px] italic leading-snug text-hub-text-secondary">
                            &ldquo;{sanitizeDashes(item.content)}&rdquo;
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Meetings */}
              {dossier.meetings.some((m) => m.location && m.geocode_status === "resolved") && (
                <section>
                  <SectionLabel>Meetings</SectionLabel>
                  <div className="flex flex-col gap-1">
                    {dossier.meetings
                      .filter((m) => m.location && m.geocode_status === "resolved")
                      .slice(0, 3)
                      .map((m, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-[12px] text-white/55"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-hub-cyan/50" />
                          <span className="text-hub-text-secondary/80">{m.location}</span>
                          {m.days && <span className="text-white/35">· {m.days}</span>}
                          {m.start_time && (
                            <span className="text-white/35">
                              · {m.start_time}–{m.end_time}
                            </span>
                          )}
                        </div>
                      ))}
                  </div>
                </section>
              )}

              {/* Editable attribute toggles */}
              {isEditable && dossier.logistics && (
                <section>
                  <SectionLabel>Edit logistics</SectionLabel>
                  <div className="flex flex-wrap gap-2">
                    {(
                      ["attendance_required", "textbook_required", "podcasts_available"] as const
                    ).map((field) => {
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
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdate?.({ logistics: { [field]: next } });
                          }}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold transition ${val === true
                              ? "border-amber-500/30 bg-amber-900/20 text-amber-300"
                              : val === false
                                ? "border-white/[0.08] bg-white/[0.03] text-white/40"
                                : "border-dashed border-white/[0.1] text-white/30"
                            }`}
                        >
                          {val === true ? trueLabel : val === false ? falseLabel : "Unknown"}
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
