"use client";

/**
 * DossierDashboardModal — "Split" dossier layout for the expanded full view.
 *
 * Refactored to match the new ClassCard system:
 *   • No nested panels. Sections are separated by space + a single consistent
 *     label treatment (uppercase 11px, `text-white/70`).
 *   • RMP stats shown as a mono-numeric row (Rating / Difficulty / Retake) —
 *     no decorative icons, no pills on numbers.
 *   • Grade distribution unboxed, more room to breathe, same fixed 4-group
 *     preview chart plus optional fine-grained histogram underneath.
 *   • Grading scheme parsed into label/value rows (Stripe-style), with a
 *     Standard / Alternate toggle when multiple schemes are detected.
 *   • Course attributes are READ-ONLY by default. An explicit "Edit" toggle
 *     in the footer reveals the Tri-state pickers — click-to-edit is too easy
 *     to trigger accidentally.
 *   • Insights column: same sentiment summary + ranked evidence list, but
 *     visually flatter (no per-source colored tile backgrounds).
 *
 * All existing props, types, callbacks, and data flows are unchanged.
 */

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileUp,
  HelpCircle,
  Info,
  Pencil,
  Quote,
  X,
} from "lucide-react";
import type {
  ClassDossier,
  CourseLogistics,
  DossierEditPatch,
  EvidenceItem,
  GradeScheme,
} from "@/types/dossier";
import { InlinePencilField } from "@/components/dashboard/InlinePencilField";
import { getSunsetSummary } from "@/lib/mappers/courseEntryToDossier";
import { isExamSection } from "@/lib/mappers/dossiersToScheduleItems";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sanitizeDashes(input: string): string {
  if (!input) return input;
  return input.replace(/[–—]|--/g, ":");
}

function confidenceColor(pct: number): string {
  if (pct <= 30) return "#ff6b6b";
  if (pct <= 70) return "#e3b12f";
  return "#00d4ff";
}

function isDossierRemoteOnly(dossier: ClassDossier): boolean {
  const regular = dossier.meetings.filter((m) => !isExamSection(m.section_type));
  return regular.length > 0 && regular.every((m) => m.geocode_status === "remote");
}

function normalizeSunsetUrl(url: string | null | undefined, courseCode: string): string | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (
    lower.includes(".csv") ||
    lower.includes("export") ||
    lower.includes("download") ||
    lower.includes("getfile")
  ) {
    const encoded = encodeURIComponent(courseCode.replace(/\s+/g, " ").trim());
    return `https://academicaffairs.ucsd.edu/Modules/ASES/Search.aspx?SearchStr=${encoded}`;
  }
  return url;
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
// Shared section label — same system as ClassCard
// ─────────────────────────────────────────────────────────────────────────────

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
    <div className={`mb-3 flex items-baseline justify-between gap-3 ${className}`}>
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
// Grading-breakdown parsing (shared with ClassCard)
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
  const total = rowTotal(rows);
  return (
    <div className="flex flex-col">
      {rows.map((row, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_auto] items-center border-b border-white/[0.05] py-2 text-[13px] last:border-0"
        >
          <span className="text-hub-text-secondary">{row.component}</span>
          <span className="font-[family-name:var(--font-jetbrains-mono)] tabular-nums text-hub-text">
            {row.weight || "—"}
          </span>
        </div>
      ))}
      {total > 0 && Math.abs(total - 100) < 0.5 && (
        <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-white/35">
          <span>Total</span>
          <span className="font-[family-name:var(--font-jetbrains-mono)] tabular-nums">100%</span>
        </div>
      )}
    </div>
  );
}

function GradingSection({
  schemes: structuredSchemes,
  breakdown,
  editable,
  onEdit,
}: {
  schemes?: GradeScheme[] | null;
  breakdown?: string | null;
  editable?: boolean;
  onEdit?: (val: string | null) => void;
}) {
  const [schemeIdx, setSchemeIdx] = useState(0);

  if (editable && onEdit) {
    return (
      <textarea
        className="w-full resize-y rounded-md border border-white/[0.1] bg-hub-bg/40 px-3 py-2 text-[13px] text-hub-text-secondary outline-none focus:border-hub-cyan/50"
        rows={4}
        value={breakdown ?? ""}
        placeholder="e.g. Homework 30%, Midterm 30%, Final 40%"
        onChange={(e) => onEdit(e.target.value || null)}
      />
    );
  }

  const schemes: GradingScheme[] =
    structuredSchemes && structuredSchemes.length > 0
      ? structuredSchemes
      : breakdown
        ? parseGradingSchemes(breakdown)
        : [];

  if (schemes.length === 0 || schemes.every((s) => s.rows.length === 0)) {
    return (
      <div className="flex items-center gap-2 text-[12.5px] text-white/45">
        <Info className="h-3 w-3" />
        Grading breakdown not found for this offering.
      </div>
    );
  }

  const isMulti = schemes.length > 1;
  const activeScheme = schemes[Math.min(schemeIdx, schemes.length - 1)];

  return (
    <div>
      {isMulti && (
        <div className="mb-3 flex items-center gap-0.5 rounded-md border border-white/[0.08] bg-white/[0.03] p-0.5 w-fit">
          {schemes.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSchemeIdx(i)}
              className={`rounded px-2.5 py-1 text-[11px] font-semibold transition ${schemeIdx === i
                  ? "bg-hub-cyan/15 text-hub-cyan"
                  : "text-white/45 hover:text-white/75"
                }`}
            >
              {s.label ?? `Option ${i + 1}`}
            </button>
          ))}
        </div>
      )}
      <SchemeRows rows={activeScheme?.rows ?? []} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Professor stats — same mono-numeric row as ClassCard
// ─────────────────────────────────────────────────────────────────────────────

function ProfStats({
  rmp,
}: {
  rmp: {
    rating: number | null;
    difficulty: number | null;
    would_take_again_percent: number | null;
    url: string | null;
  } | null;
}) {
  const items: Array<{ k: string; v: string; sub: string; tone: "teal" | "neutral" }> = [];
  if (rmp?.rating != null)
    items.push({ k: "Rating", v: rmp.rating.toFixed(1), sub: "/ 5.0", tone: "teal" });
  if (rmp?.difficulty != null)
    items.push({ k: "Difficulty", v: rmp.difficulty.toFixed(1), sub: "/ 5.0", tone: "neutral" });
  if (rmp?.would_take_again_percent != null)
    items.push({
      k: "Would retake",
      v: `${Math.round(rmp.would_take_again_percent)}`,
      sub: "%",
      tone: "neutral",
    });

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[12.5px] text-white/45">
        <span className="h-px w-3 bg-white/20" />
        No RateMyProfessors data for this instructor.
      </div>
    );
  }

  return (
    <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map((it) => (
        <div key={it.k} className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">
            {it.k}
          </span>
          <div className="flex items-baseline gap-1">
            <span
              className={`font-[family-name:var(--font-jetbrains-mono)] text-[28px] leading-none tabular-nums ${it.tone === "teal" ? "text-hub-cyan" : "text-hub-text"
                }`}
              style={{ letterSpacing: "-0.02em" }}
            >
              {it.v}
            </span>
            <span className="font-[family-name:var(--font-jetbrains-mono)] text-[13px] text-white/40">
              {it.sub}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Grade distribution — fine histogram (all grade buckets)
// ─────────────────────────────────────────────────────────────────────────────

const GRADE_ORDER = [
  "A+", "A", "A-",
  "B+", "B", "B-",
  "C+", "C", "C-",
  "D+", "D", "D-",
  "F", "P", "NP", "S", "U", "W",
];
const GRADE_COLORS: Record<string, string> = {
  "A+": "#21c1df", "A": "#20b6d9", "A-": "#1599cb",
  "B+": "#6ca8ff", "B": "#4f8dfd", "B-": "#386fda",
  "C+": "#a78bfa", "C": "#8b5cf6", "C-": "#7c3aed",
  "D+": "#ff7b94", "D": "#ff6281", "D-": "#ff5578",
  "F": "#ff4169", "P": "#7dd3fc", "NP": "#94a3b8",
  "S": "#67e8f9", "U": "#a78bfa", "W": "#64748b",
};
const GRADE_GROUPS = [
  { label: "A", grades: ["A+", "A", "A-"], color: "#26c6da" },
  { label: "B", grades: ["B+", "B", "B-"], color: "#4f8dfd" },
  { label: "C", grades: ["C+", "C", "C-"], color: "#8b5cf6" },
  { label: "D/F", grades: ["D+", "D", "D-", "F"], color: "#ff4d73" },
];

const MH_BAR_W = 26;
const MH_GAP = 6;
const MH_BAR_H = 110;
const MH_LABEL_H = 16;
const MH_SVG_W = GRADE_ORDER.length * (MH_BAR_W + MH_GAP) - MH_GAP;
const MH_SVG_H = MH_BAR_H + MH_LABEL_H + 6;

function GradeHistogram({
  gradeCounts,
  sampleSize,
}: {
  gradeCounts: Record<string, number>;
  sampleSize: number;
}) {
  const reduce = useReducedMotion();
  const segs = GRADE_ORDER.map((g) => ({
    grade: g,
    count: gradeCounts[g] ?? 0,
    color: GRADE_COLORS[g] ?? "#64748b",
  }));
  const maxCount = Math.max(...segs.map((s) => s.count), 1);
  if (!segs.some((s) => s.count > 0)) return null;

  return (
    <svg
      viewBox={`0 0 ${MH_SVG_W} ${MH_SVG_H}`}
      width="100%"
      height={MH_SVG_H}
      preserveAspectRatio="xMidYMid meet"
      aria-label="Grade distribution histogram"
      className="block"
    >
      {segs.map((seg, i) => {
        const barH = seg.count > 0 ? Math.max((seg.count / maxCount) * MH_BAR_H, 3) : 0;
        const x = i * (MH_BAR_W + MH_GAP);
        const barY = MH_BAR_H - barH;
        const pct = Math.round((seg.count / sampleSize) * 100);
        return (
          <g key={seg.grade}>
            {seg.count > 0 && (
              <motion.rect
                x={x}
                width={MH_BAR_W}
                fill={seg.color}
                fillOpacity={0.78}
                rx={3}
                initial={reduce ? undefined : { height: 0, y: MH_BAR_H }}
                animate={{ height: barH, y: barY }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.1 + i * 0.02 }}
              >
                <title>
                  {seg.grade}: {pct}% ({seg.count} students)
                </title>
              </motion.rect>
            )}
            <text
              x={x + MH_BAR_W / 2}
              y={MH_SVG_H - 3}
              textAnchor="middle"
              fontSize={9}
              fontFamily="var(--font-jetbrains-mono)"
              fill={seg.count > 0 ? "rgba(180,190,207,0.88)" : "rgba(180,190,207,0.28)"}
            >
              {seg.grade}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Grouped A / B / C / D·F bars (beneath histogram)
function GradeGroupBars({
  gradeCounts,
  sampleSize,
}: {
  gradeCounts: Record<string, number>;
  sampleSize: number;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="space-y-2.5">
      {GRADE_GROUPS.map((group, i) => {
        const total = group.grades.reduce((s, g) => s + (gradeCounts[g] ?? 0), 0);
        if (total === 0 || !sampleSize) return null;
        const pct = (total / sampleSize) * 100;
        return (
          <div key={group.label}>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="font-semibold" style={{ color: group.color }}>
                {group.label}
              </span>
              <span className="font-[family-name:var(--font-jetbrains-mono)] tabular-nums text-white/55">
                {pct >= 1 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
              <motion.div
                className="h-full rounded-full"
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 + i * 0.07 }}
                style={{ backgroundColor: group.color, opacity: 0.78 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Logistics — read-only display
// ─────────────────────────────────────────────────────────────────────────────

function LogisticsDisplay({ logistics }: { logistics: CourseLogistics | undefined }) {
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
  resolve("Textbook", logistics?.textbook_required, "Required", "None");
  resolve("Attendance", logistics?.attendance_required, "Required", "Optional");
  resolve("Podcasts", logistics?.podcasts_available, "Available", "Not recorded");

  return (
    <div className="grid grid-cols-3 gap-4">
      {rows.map((r) => (
        <div key={r.k} className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">
            {r.k}
          </span>
          <span
            className={`text-[13px] ${r.tone === "on"
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

// Tri-state cycle picker (Yes → No → Unknown) — only rendered in Edit mode
function TristateToggle({
  label,
  value,
  onChange,
  onLabel,
  offLabel,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  onLabel: string;
  offLabel: string;
}) {
  const cycle = () => {
    if (value === null) onChange(true);
    else if (value === true) onChange(false);
    else onChange(null);
  };

  const display =
    value === true
      ? { text: onLabel, cls: "border-amber-500/30 bg-amber-900/20 text-amber-300" }
      : value === false
        ? { text: offLabel, cls: "border-white/[0.1] bg-white/[0.04] text-white/55" }
        : { text: "Unknown", cls: "border-dashed border-white/[0.12] bg-transparent text-white/35" };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">
        {label}
      </span>
      <button
        type="button"
        onClick={cycle}
        title="Click to cycle: Yes → No → Unknown"
        className={`self-start rounded-full border px-2.5 py-1 text-[11px] font-semibold transition hover:opacity-80 ${display.cls}`}
      >
        {display.text}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Evidence entry — flatter, consistent
// ─────────────────────────────────────────────────────────────────────────────

function EvidenceEntry({ item }: { item: EvidenceItem }) {
  const truncated =
    item.content.length > 280 ? item.content.slice(0, 278).trimEnd() + "…" : item.content;
  return (
    <div className="flex items-start gap-2.5 border-b border-white/[0.05] py-3 last:border-0">
      <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/30" />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between gap-2">
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
              className="flex items-center gap-1 text-[10px] text-white/40 transition hover:text-hub-cyan"
            >
              Source <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
        <p className="text-[13px] italic leading-relaxed text-hub-text-secondary">
          &ldquo;{sanitizeDashes(truncated)}&rdquo;
        </p>
        {item.relevance_score != null && item.relevance_score > 0 && (
          <div className="mt-2 h-px w-full rounded-full bg-white/[0.04]">
            <div
              className="h-px rounded-full"
              style={{
                width: `${Math.round((item.relevance_score ?? 0) * 100)}%`,
                background: "var(--hub-cyan)",
                opacity: 0.4,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal shell
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  dossiers: ClassDossier[];
  openIndex: number | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onUpdate?: (dossierId: string, patch: DossierEditPatch) => void;
};

export function DossierDashboardModal({
  dossiers,
  openIndex,
  onClose,
  onNavigate,
  onUpdate,
}: Props) {
  const isOpen = openIndex !== null;
  const dossier = openIndex !== null ? dossiers[openIndex] : null;
  const total = dossiers.length;

  const goPrev = useCallback(() => {
    if (openIndex === null) return;
    onNavigate((openIndex - 1 + total) % total);
  }, [openIndex, total, onNavigate]);

  const goNext = useCallback(() => {
    if (openIndex === null) return;
    onNavigate((openIndex + 1) % total);
  }, [openIndex, total, onNavigate]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose, goPrev, goNext]);

  return (
    <AnimatePresence>
      {isOpen && dossier && (
        <motion.div
          key="dossier-dashboard-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          {total > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
              className="absolute left-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.1] bg-hub-surface/80 text-white/55 shadow-xl backdrop-blur-md transition hover:border-hub-cyan/40 hover:bg-hub-surface hover:text-hub-cyan"
              aria-label="Previous course"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}

          {total > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
              className="absolute right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.1] bg-hub-surface/80 text-white/55 shadow-xl backdrop-blur-md transition hover:border-hub-cyan/40 hover:bg-hub-surface hover:text-hub-cyan"
              aria-label="Next course"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          <motion.div
            key={`panel-${openIndex}`}
            initial={{ y: 16, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 10, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            className="relative mx-14 flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-hub-surface shadow-[0_32px_80px_rgba(0,0,0,0.7)] max-h-[92vh]"
          >
            <DashboardContent
              dossier={dossier}
              index={openIndex!}
              total={total}
              onClose={onClose}
              onNavigate={onNavigate}
              onUpdate={onUpdate ? (patch) => onUpdate(dossier.id, patch) : undefined}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard content
// ─────────────────────────────────────────────────────────────────────────────

function DashboardContent({
  dossier,
  index,
  total,
  onClose,
  onNavigate,
  onUpdate,
}: {
  dossier: ClassDossier;
  index: number;
  total: number;
  onClose: () => void;
  onNavigate: (i: number) => void;
  onUpdate?: (patch: DossierEditPatch) => void;
}) {
  // Edit mode is explicit, off by default — click-to-edit was too easy to trigger.
  const [editMode, setEditMode] = useState(false);

  const log = dossier.logistics;
  const rmp = log?.rate_my_professor ?? null;
  const sunsetSummary = getSunsetSummary(dossier.sunsetGradeDistribution);
  const sampleSize =
    sunsetSummary?.sample_size ??
    Object.values(sunsetSummary?.grade_counts ?? {}).reduce((s, c) => s + c, 0);
  const hasGrades =
    sunsetSummary?.average_gpa != null ||
    (sampleSize > 0 && Object.keys(sunsetSummary?.grade_counts ?? {}).length > 0);
  const allEvidence = [...(log?.evidence ?? [])].sort(
    (a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0),
  );
  const professorInfoFound = log?.professor_info_found !== false;
  const isCrossCourse = dossier.sunsetGradeDistribution?.is_cross_course_fallback === true;
  const confColor = confidenceColor(dossier.confidencePercent);

  const sunsetUrl = normalizeSunsetUrl(
    dossier.sunsetGradeDistribution?.source_url,
    isCrossCourse && dossier.sunsetGradeDistribution?.source_course_code
      ? dossier.sunsetGradeDistribution.source_course_code
      : dossier.courseCode,
  );

  return (
    <div className="flex flex-col overflow-hidden">
      {/* ───── Header ───── */}
      <header className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-6 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="font-[family-name:var(--font-outfit)] text-[22px] font-semibold tracking-tight text-hub-text">
              {dossier.courseCode}
            </h2>
            {isDossierRemoteOnly(dossier) && (
              <span className="rounded-full border border-purple-400/35 bg-purple-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-purple-300">
                Remote
              </span>
            )}
            <span className="text-[14px] text-white/55">
              <InlinePencilField
                value={dossier.courseTitle ?? ""}
                placeholder="Course title"
                onSave={(v) => onUpdate?.({ courseTitle: v })}
              />
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-hub-cyan/30 bg-hub-cyan/10 text-[10px] font-bold text-hub-cyan">
              {dossier.professorInitials}
            </span>
            <span className="text-[13px] text-hub-text-secondary">
              <InlinePencilField
                value={dossier.professorName ?? ""}
                placeholder="Professor name"
                onSave={(v) => onUpdate?.({ professorName: v })}
              />
            </span>
            {!professorInfoFound && (
              <span className="flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-900/15 px-2 py-0.5 text-[9px] font-semibold text-amber-400">
                <Info className="h-2.5 w-2.5" /> No specific data found
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {/* Upload syllabus — disabled placeholder */}
          <div className="relative group/syllabus">
            <button
              type="button"
              disabled
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-white/35 cursor-not-allowed"
            >
              <FileUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Upload syllabus
            </button>
            <div className="pointer-events-none absolute right-0 top-full mt-1.5 z-10 w-52 rounded-lg border border-white/[0.08] bg-hub-bg px-3 py-2 text-[10px] leading-relaxed text-white/55 opacity-0 transition-opacity group-hover/syllabus:opacity-100">
              <span className="mb-1 block font-semibold text-hub-cyan/70">Coming soon</span>
              Upload a course syllabus to auto-fill grading scheme, attendance policy, and other logistics.
            </div>
          </div>

          {/* Course pager */}
          {total > 1 && (
            <div className="flex items-center gap-1.5">
              {Array.from({ length: total }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onNavigate(i)}
                  aria-label={`Go to course ${i + 1}`}
                  aria-current={i === index ? "true" : undefined}
                  className={`rounded-full transition-all duration-200 ${i === index
                      ? "h-2 w-4 bg-hub-cyan cursor-default"
                      : "h-1.5 w-1.5 bg-white/20 hover:bg-white/40 cursor-pointer"
                    }`}
                />
              ))}
              <span className="ml-1 font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-white/45">
                {index + 1}/{total}
              </span>
            </div>
          )}

          {/* Confidence */}
          <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-hub-bg/50 px-2.5 py-1.5">
            <div className="h-1.5 w-12 overflow-hidden rounded-full bg-hub-bg/80">
              <div
                className="h-full rounded-full"
                style={{ width: `${dossier.confidencePercent}%`, backgroundColor: confColor }}
              />
            </div>
            <span
              className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-semibold tabular-nums"
              style={{ color: confColor }}
            >
              {dossier.confidencePercent}%
            </span>
            <HelpCircle className="h-3 w-3 text-white/35" />
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.07] text-white/55 transition hover:border-white/20 hover:text-hub-text"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ───── Body ───── */}
      <div className="flex-1 overflow-y-auto hub-scroll">
        {/* Cross-course data banner spans full width */}
        {isCrossCourse && (
          <div className="mx-6 mt-5 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-900/10 px-3 py-2.5">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400/80" />
            <div>
              <p className="text-[11px] font-semibold text-amber-400/90">
                Data from{" "}
                {dossier.sunsetGradeDistribution?.source_course_code ?? "another course"}
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-amber-300/75">
                {dossier.professorName} has not taught {dossier.courseCode} before — showing
                grades from{" "}
                {dossier.sunsetGradeDistribution?.source_course_code ?? "a related course"} as
                reference.
              </p>
            </div>
          </div>
        )}

        {/* Three-column primary grid */}
        <div className="grid grid-cols-1 gap-8 px-6 py-6 lg:grid-cols-[1.05fr_1.15fr_1fr]">
          {/* ── Col 1: Professor + sentiment ── */}
          <div className="flex flex-col gap-7">
            {/* General overview fallback (when professor data is missing) */}
            {!professorInfoFound && (log?.general_course_overview || log?.general_professor_overview) && (
              <section>
                <SectionLabel>General overview</SectionLabel>
                {log?.general_course_overview && (
                  <p className="mb-3 text-[13px] leading-relaxed text-hub-text-secondary">
                    {log.general_course_overview}
                  </p>
                )}
                {log?.general_professor_overview && (
                  <>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50">
                      About {dossier.professorName}
                    </p>
                    <p className="text-[13px] leading-relaxed text-hub-text-secondary">
                      {log.general_professor_overview}
                    </p>
                  </>
                )}
              </section>
            )}

            <section>
              <SectionLabel right={rmp?.url ? "RateMyProfessors" : undefined}>
                Professor
              </SectionLabel>
              <ProfStats rmp={rmp} />
              {rmp?.url && (
                <a
                  href={rmp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-[11px] text-hub-cyan/85 transition hover:text-hub-cyan"
                >
                  View full profile <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </section>

            {dossier.tldr && (
              <section>
                <SectionLabel>Student sentiment</SectionLabel>
                <p
                  className="text-[14px] leading-relaxed text-hub-text-secondary"
                  style={{ textWrap: "pretty" }}
                >
                  {sanitizeDashes(dossier.tldr)}
                </p>
              </section>
            )}
          </div>

          {/* ── Col 2: Grade distribution ── */}
          <div className="flex flex-col gap-5">
            <section>
              <SectionLabel
                right={
                  hasGrades
                    ? [
                      dossier.sunsetGradeDistribution?.term_label,
                      sampleSize > 0 ? `n=${sampleSize}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                    : "no prior data"
                }
              >
                {isCrossCourse
                  ? `Grade dist · ${dossier.sunsetGradeDistribution?.source_course_code ?? "other"
                  }`
                  : "Grade distribution"}
              </SectionLabel>

              {hasGrades ? (
                <>
                  {/* GPA + recommend headline */}
                  {(sunsetSummary?.average_gpa != null ||
                    dossier.sunsetGradeDistribution?.recommend_professor_percent != null) && (
                      <div className="mb-5 flex items-end gap-8">
                        {sunsetSummary?.average_gpa != null && (
                          <div>
                            <p
                              className="font-[family-name:var(--font-jetbrains-mono)] text-[44px] font-semibold tabular-nums text-hub-cyan leading-none"
                              style={{ letterSpacing: "-0.02em" }}
                            >
                              {sunsetSummary.average_gpa}
                            </p>
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">
                              Avg GPA
                            </p>
                          </div>
                        )}
                        {dossier.sunsetGradeDistribution?.recommend_professor_percent != null && (
                          <div>
                            <p
                              className="font-[family-name:var(--font-jetbrains-mono)] text-[28px] font-semibold tabular-nums text-emerald-400 leading-none"
                              style={{ letterSpacing: "-0.02em" }}
                            >
                              {Math.round(
                                dossier.sunsetGradeDistribution.recommend_professor_percent,
                              )}
                              %
                            </p>
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">
                              Recommend
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                  {/* Full histogram */}
                  {sampleSize > 0 &&
                    Object.keys(sunsetSummary?.grade_counts ?? {}).length > 0 && (
                      <div className="mb-5">
                        <GradeHistogram
                          gradeCounts={sunsetSummary?.grade_counts ?? {}}
                          sampleSize={sampleSize}
                        />
                      </div>
                    )}

                  {/* Grouped bars */}
                  {sampleSize > 0 && (
                    <GradeGroupBars
                      gradeCounts={sunsetSummary?.grade_counts ?? {}}
                      sampleSize={sampleSize}
                    />
                  )}

                  {sunsetUrl && (
                    <div className="mt-4">
                      <a
                        href={sunsetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-hub-cyan/85 transition hover:text-hub-cyan"
                      >
                        View on SunSET <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="mb-2 h-8 w-8 rounded-full border border-dashed border-white/[0.1] flex items-center justify-center">
                    <span className="text-lg text-white/30">∅</span>
                  </div>
                  <p className="text-[13px] text-white/55">No grade distribution data.</p>
                  {!isCrossCourse && (
                    <p className="mt-1 text-[11px] text-white/40">
                      SunSET may not have data for this specific offering.
                    </p>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* ── Col 3: Insights ── */}
          <div className="flex flex-col gap-5">
            <section className="flex-1">
              <SectionLabel
                right={
                  allEvidence.length > 0
                    ? `${allEvidence.length} source${allEvidence.length === 1 ? "" : "s"}`
                    : undefined
                }
              >
                Insights
              </SectionLabel>

              {allEvidence.length > 0 ? (
                <div
                  className="-my-1 flex flex-col overflow-y-auto hub-scroll pr-1"
                  style={{ maxHeight: "420px" }}
                >
                  {allEvidence.map((item, i) => (
                    <EvidenceEntry key={i} item={item} />
                  ))}
                </div>
              ) : log != null ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-[13px] text-white/55">
                    No direct quotes or sources found.
                  </p>
                  {log?.general_course_overview && (
                    <p className="mt-3 text-[13px] leading-relaxed text-hub-text-secondary">
                      {log.general_course_overview}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse rounded-lg bg-white/[0.03] p-3">
                      <div className="mb-2 h-2 w-16 rounded bg-white/[0.06]" />
                      <div className="space-y-1.5">
                        <div className="h-2 rounded bg-white/[0.04]" />
                        <div className="h-2 w-4/5 rounded bg-white/[0.04]" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* ───── Bottom grid: grading + logistics ───── */}
        <div className="border-t border-white/[0.06] px-6 py-6">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.1fr_1fr]">
            <section>
              <SectionLabel
                right={
                  log?.course_webpage_url ? (
                    <a
                      href={log.course_webpage_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-hub-cyan/85 transition hover:text-hub-cyan"
                    >
                      Course page <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  ) : undefined
                }
              >
                Grading scheme
              </SectionLabel>
              <GradingSection
                schemes={log?.grade_schemes}
                breakdown={log?.grade_breakdown}
                editable={editMode && !!onUpdate}
                onEdit={
                  onUpdate
                    ? (v) => onUpdate({ logistics: { grade_breakdown: v } })
                    : undefined
                }
              />
            </section>

            <section>
              <SectionLabel
                right={
                  onUpdate ? (
                    <button
                      type="button"
                      onClick={() => setEditMode((v) => !v)}
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] transition ${editMode
                          ? "border-hub-cyan/40 bg-hub-cyan/10 text-hub-cyan"
                          : "border-white/[0.1] text-white/55 hover:border-white/20 hover:text-white/80"
                        }`}
                    >
                      <Pencil className="h-2.5 w-2.5" />
                      {editMode ? "Done" : "Correct"}
                    </button>
                  ) : undefined
                }
              >
                Course attributes
              </SectionLabel>

              {editMode && onUpdate ? (
                <div className="grid grid-cols-3 gap-4">
                  <TristateToggle
                    label="Textbook"
                    value={log?.textbook_required ?? null}
                    onChange={(v) => onUpdate({ logistics: { textbook_required: v } })}
                    onLabel="Required"
                    offLabel="None"
                  />
                  <TristateToggle
                    label="Attendance"
                    value={log?.attendance_required ?? null}
                    onChange={(v) => onUpdate({ logistics: { attendance_required: v } })}
                    onLabel="Required"
                    offLabel="Optional"
                  />
                  <TristateToggle
                    label="Podcasts"
                    value={log?.podcasts_available ?? null}
                    onChange={(v) => onUpdate({ logistics: { podcasts_available: v } })}
                    onLabel="Available"
                    offLabel="Not recorded"
                  />
                </div>
              ) : (
                <LogisticsDisplay logistics={log} />
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
