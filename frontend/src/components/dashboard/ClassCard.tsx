"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  BookOpen,
  ChevronRight,
  ExternalLink,
  Info,
  RotateCcw,
  Star,
  Zap,
} from "lucide-react";
import type { ClassDossier, CourseLogistics, EvidenceItem } from "@/types/dossier";
import { ConflictBadge } from "@/components/dashboard/ConflictBadge";
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

// ── Categorised attribute chips (Payments / Attendance) ──────────────────────
type AttrChip = { label: string; tone: "amber" | "green" | "muted" };

const ATTR_CHIP_STYLES: Record<AttrChip["tone"], string> = {
  amber: "border-amber-500/30 bg-amber-900/30 text-amber-400",
  green: "border-emerald-500/30 bg-emerald-900/20 text-emerald-400",
  muted: "border-white/[0.08] bg-slate-800/60 text-slate-400",
};

function Chip({ chip }: { chip: AttrChip }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ATTR_CHIP_STYLES[chip.tone]}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          chip.tone === "amber" ? "bg-amber-400" : chip.tone === "green" ? "bg-emerald-400" : "bg-white/20"
        }`}
      />
      {chip.label}
    </span>
  );
}

function AttributeChips({ logistics }: { logistics: CourseLogistics | undefined }) {
  if (!logistics) return null;

  const payments: AttrChip[] = [];
  if (logistics.textbook_required === true)
    payments.push({ label: "Textbook Required", tone: "amber" });
  else if (logistics.textbook_required === false)
    payments.push({ label: "No Textbook", tone: "muted" });

  const attendance: AttrChip[] = [];
  if (logistics.attendance_required === true)
    attendance.push({ label: "Attendance Mandatory", tone: "amber" });
  else if (logistics.attendance_required === false)
    attendance.push({ label: "Attendance Optional", tone: "muted" });
  if (logistics.podcasts_available === true)
    attendance.push({ label: "Podcasts Available", tone: "green" });
  else if (logistics.podcasts_available === false)
    attendance.push({ label: "No Podcasts", tone: "muted" });

  if (payments.length === 0 && attendance.length === 0) return null;

  return (
    <div className="space-y-1">
      {payments.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-16 shrink-0 text-[9px] font-medium text-hub-text-muted/60">Payments</span>
          {payments.map((c) => <Chip key={c.label} chip={c} />)}
        </div>
      )}
      {attendance.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-20 shrink-0 text-[9px] font-medium text-hub-text-muted/60">Attendance</span>
          {attendance.map((c) => <Chip key={c.label} chip={c} />)}
        </div>
      )}
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

// ── Grade breakdown strip ──────────────────────────────────────────────────────
function GradeBreakdownStrip({ breakdown }: { breakdown: string | null | undefined }) {
  if (!breakdown) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-white/[0.06] px-3 py-2">
        <Info className="h-3 w-3 shrink-0 text-hub-text-muted/50" />
        <span className="text-[10px] text-hub-text-muted">Course logistics not found</span>
      </div>
    );
  }

  // Parse "Homework 20%, Midterm 30%, Final 50%" into segments
  const segments = breakdown
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="rounded-lg border border-white/[0.06] bg-hub-bg/20 px-3 py-2">
      <p className="mb-1.5 text-[9px] font-medium text-hub-text-muted/70">
        Grading
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((seg, i) => (
          <span key={i} className="text-xs text-hub-text-secondary">
            {seg}
          </span>
        ))}
      </div>
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
          className="mt-0.5 shrink-0 text-hub-text-muted/60 transition hover:text-hub-cyan"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

// ── SVG mini histogram for grade distribution ─────────────────────────────────
function GradeHistogram({
  gradeCounts,
  sampleSize,
}: {
  gradeCounts: Record<string, number>;
  sampleSize: number;
}) {
  const ORDER = [
    "A+","A","A-","B+","B","B-","C+","C","C-","D+","D","D-","F","P","NP","S","U","W","EW","I",
  ];
  const segments = ORDER.map((grade) => ({
    grade,
    count: gradeCounts[grade] ?? 0,
    color: SUNSET_SEGMENT_COLORS[grade] ?? "#64748b",
  })).filter((s) => s.count > 0);

  if (segments.length === 0) return null;

  const maxCount = Math.max(...segments.map((s) => s.count));
  const BAR_H = 110;
  const BAR_W = 20;
  const GAP = 5;
  const PCT_LABEL_H = 14;  // space above bar for % label
  const GRADE_LABEL_H = 16; // space below bar for grade label
  const svgW = segments.length * (BAR_W + GAP) - GAP;
  const svgH = PCT_LABEL_H + BAR_H + GRADE_LABEL_H;

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      className="w-full"
      aria-label="Grade distribution histogram"
    >
      {segments.map((seg, i) => {
        const barH = Math.max((seg.count / maxCount) * BAR_H, 3);
        const x = i * (BAR_W + GAP);
        const barY = PCT_LABEL_H + (BAR_H - barH);
        const pct = Math.round((seg.count / sampleSize) * 100);
        return (
          <g key={seg.grade}>
            {/* Percentage label above bar — only show if ≥5% to avoid clutter */}
            {pct >= 5 && (
              <text
                x={x + BAR_W / 2}
                y={barY - 3}
                textAnchor="middle"
                fontSize={7}
                fontWeight={600}
                fill={seg.color}
                fillOpacity={0.9}
              >
                {pct}%
              </text>
            )}
            <rect
              x={x}
              y={barY}
              width={BAR_W}
              height={barH}
              fill={seg.color}
              fillOpacity={0.85}
              rx={3}
            >
              <title>{seg.grade}: {pct}% ({seg.count} students)</title>
            </rect>
            {/* Grade label below bar */}
            <text
              x={x + BAR_W / 2}
              y={svgH - 3}
              textAnchor="middle"
              fontSize={8}
              fill="rgba(148,163,184,0.9)"
            >
              {seg.grade}
            </text>
          </g>
        );
      })}
    </svg>
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
}: ClassCardProps) {

  const rmp = dossier.logistics?.rate_my_professor;
  const sunsetSummary = getSunsetSummary(dossier.sunsetGradeDistribution);
  const sunsetSampleSize =
    sunsetSummary?.sample_size ??
    Object.values(sunsetSummary?.grade_counts ?? {}).reduce(
      (sum, count) => sum + count,
      0,
    );
  const sunsetPrimaryGroups = getPrimarySunsetGroups(
    sunsetSummary?.grade_counts ?? {},
    sunsetSampleSize,
  );
  const sunsetSegments = getSunsetSegments(
    sunsetSummary?.grade_counts ?? {},
    sunsetSampleSize,
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
        className={`rounded-xl border bg-hub-surface/90 p-4 shadow-sm transition-colors duration-200 cursor-pointer
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
                  {dossier.courseTitle}
                </span>
              </h3>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/[0.1] bg-hub-bg/50 text-[10px] font-semibold text-hub-cyan">
                  {dossier.professorInitials}
                </span>
                <span className="text-sm text-hub-text-secondary">
                  {dossier.professorName}
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
                  className="flex items-center gap-1 rounded-lg border border-hub-cyan/30 bg-hub-cyan/10 px-3 py-1.5 text-xs font-semibold text-hub-cyan transition hover:bg-hub-cyan/20 hover:border-hub-cyan/50"
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
                  <span className="text-[10px] text-hub-text-muted/70">Rating</span>
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
                    <span className="text-[10px] text-hub-text-muted/70">Difficulty</span>
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
                    <span className="text-[10px] text-hub-text-muted/70">Retake</span>
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
                    <span className="text-[10px] text-hub-text-muted/70">
                      {dossier.sunsetGradeDistribution?.is_cross_course_fallback ? "Other GPA*" : "Avg GPA"}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Grade breakdown / course logistics strip */}
          {dossier.logistics != null && (
            <GradeBreakdownStrip breakdown={dossier.logistics.grade_breakdown} />
          )}

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

type SunsetGroup = {
  label: string;
  color: string;
  percent: number;
  breakdown: string[];
};

type SunsetSegment = {
  grade: string;
  count: number;
  percent: number;
  color: string;
};

const SUNSET_GROUPS: Array<{
  label: string;
  grades: string[];
  color: string;
}> = [
  { label: "A", grades: ["A+", "A", "A-"], color: "#26c6da" },
  { label: "B", grades: ["B+", "B", "B-"], color: "#4f8dfd" },
  { label: "C", grades: ["C+", "C", "C-"], color: "#8b5cf6" },
  { label: "D/F", grades: ["D+", "D", "D-", "F"], color: "#ff4d73" },
];

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

function formatPercent(percent: number) {
  if (percent >= 10) return `${Math.round(percent)}%`;
  if (percent >= 1) return `${percent.toFixed(1).replace(/\.0$/, "")}%`;
  return `${percent.toFixed(1)}%`;
}

function getPrimarySunsetGroups(
  gradeCounts: Record<string, number>,
  sampleSize: number,
): SunsetGroup[] {
  if (!sampleSize) return [];

  return SUNSET_GROUPS.map((group) => {
    const breakdown = group.grades
      .filter((grade) => (gradeCounts[grade] ?? 0) > 0)
      .map(
        (grade) =>
          `${grade}: ${formatPercent(
            ((gradeCounts[grade] ?? 0) / sampleSize) * 100,
          )}`,
      );

    const total = group.grades.reduce(
      (sum, grade) => sum + (gradeCounts[grade] ?? 0),
      0,
    );

    return {
      label: group.label,
      color: group.color,
      percent: (total / sampleSize) * 100,
      breakdown,
    };
  }).filter((group) => group.percent > 0);
}

function getSunsetSegments(
  gradeCounts: Record<string, number>,
  sampleSize: number,
): SunsetSegment[] {
  if (!sampleSize) return [];

  return Object.entries(gradeCounts)
    .filter(([, count]) => count > 0)
    .map(([grade, count]) => ({
      grade,
      count,
      percent: (count / sampleSize) * 100,
      color: SUNSET_SEGMENT_COLORS[grade] ?? "#64748b",
    }))
    .sort((a, b) => gradeSortIndex(a.grade) - gradeSortIndex(b.grade));
}

function gradeSortIndex(grade: string) {
  const order = [
    "A+","A","A-","B+","B","B-","C+","C","C-",
    "D+","D","D-","F","P","NP","S","U","W","EW","I",
  ];
  const index = order.indexOf(grade);
  return index === -1 ? order.length : index;
}
