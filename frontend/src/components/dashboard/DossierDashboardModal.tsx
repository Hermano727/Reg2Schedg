"use client";

import { useCallback, useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  HelpCircle,
  Info,
  RotateCcw,
  Star,
  X,
  Zap,
} from "lucide-react";
import type { ClassDossier, CourseLogistics, EvidenceItem } from "@/types/dossier";
import { getSunsetSummary } from "@/lib/mappers/courseEntryToDossier";
import { isExamSection } from "@/lib/mappers/dossiersToScheduleItems";

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeDashes(input: string): string {
  if (!input) return input;
  return input.replace(/[–—]|--/g, "·");
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

/** Transform CSV export URLs into a proper SunSET search URL */
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
  return "text-hub-text-muted";
}

function sourceBg(source: string): string {
  const lower = source.toLowerCase();
  if (lower.includes("reddit")) return "bg-orange-500/10 border-orange-500/20";
  if (lower.includes("syllabus")) return "bg-emerald-500/10 border-emerald-500/20";
  if (lower.includes("course") || lower.includes("prof")) return "bg-hub-cyan/8 border-hub-cyan/20";
  if (lower.includes("rmp") || lower.includes("rate")) return "bg-amber-500/10 border-amber-500/20";
  return "bg-white/[0.03] border-white/[0.06]";
}

// ── Grade histogram ───────────────────────────────────────────────────────────

const GRADE_ORDER = ["A+","A","A-","B+","B","B-","C+","C","C-","D+","D","D-","F","P","NP","S","U","W"];
const GRADE_COLORS: Record<string, string> = {
  "A+": "#21c1df", "A": "#20b6d9", "A-": "#1599cb",
  "B+": "#6ca8ff", "B": "#4f8dfd", "B-": "#386fda",
  "C+": "#a78bfa", "C": "#8b5cf6", "C-": "#7c3aed",
  "D+": "#ff7b94", "D": "#ff6281", "D-": "#ff5578",
  "F": "#ff4169", "P": "#7dd3fc", "NP": "#94a3b8",
  "S": "#67e8f9", "U": "#a78bfa", "W": "#64748b",
};
const GRADE_GROUPS = [
  { label: "A", grades: ["A+","A","A-"], color: "#26c6da" },
  { label: "B", grades: ["B+","B","B-"], color: "#4f8dfd" },
  { label: "C", grades: ["C+","C","C-"], color: "#8b5cf6" },
  { label: "D/F", grades: ["D+","D","D-","F"], color: "#ff4d73" },
];

function GradeHistogram({ gradeCounts, sampleSize }: { gradeCounts: Record<string, number>; sampleSize: number }) {
  const reduce = useReducedMotion();
  const segs = GRADE_ORDER
    .map((g) => ({ grade: g, count: gradeCounts[g] ?? 0, color: GRADE_COLORS[g] ?? "#64748b" }))
    .filter((s) => s.count > 0);
  if (segs.length === 0) return null;

  const maxCount = Math.max(...segs.map((s) => s.count));
  const BAR_W = 22;
  const GAP = 4;
  const BAR_H = 80;
  const LABEL_H = 14;
  const svgW = segs.length * (BAR_W + GAP) - GAP;
  const svgH = BAR_H + LABEL_H + 4;

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" aria-label="Grade distribution histogram">
      {segs.map((seg, i) => {
        const barH = Math.max((seg.count / maxCount) * BAR_H, 3);
        const x = i * (BAR_W + GAP);
        const barY = BAR_H - barH;
        const pct = Math.round((seg.count / sampleSize) * 100);
        return (
          <g key={seg.grade}>
            <motion.rect
              x={x}
              width={BAR_W}
              fill={seg.color}
              fillOpacity={0.8}
              rx={3}
              initial={reduce ? undefined : { height: 0, y: BAR_H }}
              animate={{ height: barH, y: barY }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.1 + i * 0.025 }}
            >
              <title>{seg.grade}: {pct}% ({seg.count} students)</title>
            </motion.rect>
            <text x={x + BAR_W / 2} y={svgH - 2} textAnchor="middle"
              fontSize={8} fill="rgba(148,163,184,0.85)">{seg.grade}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ label, accent, children, className = "" }: {
  label: string;
  accent?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col rounded-xl border border-white/[0.07] bg-[#0d1b2e] p-4 ${className}`}>
      <p className={`mb-3 text-[10px] font-semibold tracking-wide ${accent ?? "text-hub-text-muted"}`}>
        {label}
      </p>
      {children}
    </div>
  );
}

// ── RMP stat row ──────────────────────────────────────────────────────────────

function RmpStat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2">
      {icon}
      <div>
        <p className="font-[family-name:var(--font-jetbrains-mono)] text-lg font-bold tabular-nums text-hub-text leading-none">
          {value}
        </p>
        <p className="text-[9px] text-hub-text-muted/70 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ── Evidence item ─────────────────────────────────────────────────────────────

function EvidenceEntry({ item }: { item: EvidenceItem }) {
  const truncated = item.content.length > 180
    ? item.content.slice(0, 178).trimEnd() + "…"
    : item.content;
  return (
    <div className={`rounded-lg border p-3 ${sourceBg(item.source)}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className={`text-[9px] font-semibold ${sourceColor(item.source)}`}>
          {item.source}
        </span>
        {item.url && (
          <a href={item.url} target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 rounded border border-white/[0.08] px-1.5 py-0.5 text-[9px] text-hub-text-muted transition hover:text-hub-cyan hover:border-hub-cyan/30">
            Open <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>
      <p className="text-xs leading-relaxed text-hub-text-secondary italic">
        &ldquo;{sanitizeDashes(truncated)}&rdquo;
      </p>
      <div className="mt-2 h-px w-full rounded-full bg-white/[0.04]">
        <div className="h-px rounded-full"
          style={{ width: `${Math.round((item.relevance_score ?? 0) * 100)}%`, background: "var(--hub-cyan)", opacity: 0.4 }} />
      </div>
    </div>
  );
}

// ── Logistics chips ───────────────────────────────────────────────────────────

function LogisticPill({ label, tone }: { label: string; tone: "green" | "amber" | "muted" }) {
  const styles = {
    green: "border-emerald-500/25 bg-emerald-900/20 text-emerald-400",
    amber: "border-amber-500/25 bg-amber-900/20 text-amber-400",
    muted: "border-white/[0.07] bg-white/[0.03] text-hub-text-muted",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${styles[tone]}`}>
      {label}
    </span>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

type Props = {
  dossiers: ClassDossier[];
  openIndex: number | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
};

export function DossierDashboardModal({ dossiers, openIndex, onClose, onNavigate }: Props) {
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
          {/* ── Left nav arrow ── */}
          {total > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); goPrev(); }}
              className="absolute left-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.1] bg-hub-surface/80 text-hub-text-muted shadow-xl backdrop-blur-md transition hover:border-hub-cyan/40 hover:bg-hub-surface hover:text-hub-cyan"
              aria-label="Previous course"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}

          {/* ── Right nav arrow ── */}
          {total > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); goNext(); }}
              className="absolute right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.1] bg-hub-surface/80 text-hub-text-muted shadow-xl backdrop-blur-md transition hover:border-hub-cyan/40 hover:bg-hub-surface hover:text-hub-cyan"
              aria-label="Next course"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          {/* ── Panel ── */}
          <motion.div
            key={`panel-${openIndex}`}
            initial={{ y: 16, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 10, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            className="relative mx-14 flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-hub-surface shadow-[0_32px_80px_rgba(0,0,0,0.7)] max-h-[90vh]"
          >
            <DashboardContent
              dossier={dossier}
              index={openIndex!}
              total={total}
              onClose={onClose}
              onNavigate={onNavigate}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Dashboard content (keyed for animation between courses) ──────────────────

function DashboardContent({
  dossier,
  index,
  total,
  onClose,
  onNavigate,
}: {
  dossier: ClassDossier;
  index: number;
  total: number;
  onClose: () => void;
  onNavigate: (i: number) => void;
}) {
  const reduce = useReducedMotion();
  const log = dossier.logistics;
  const rmp = log?.rate_my_professor;
  const sunsetSummary = getSunsetSummary(dossier.sunsetGradeDistribution);
  const sampleSize =
    sunsetSummary?.sample_size ??
    Object.values(sunsetSummary?.grade_counts ?? {}).reduce((s, c) => s + c, 0);
  const hasGrades =
    sunsetSummary?.average_gpa != null ||
    (sampleSize > 0 && Object.keys(sunsetSummary?.grade_counts ?? {}).length > 0);
  const hasRmp = rmp && (rmp.rating != null || rmp.difficulty != null || rmp.would_take_again_percent != null);
  const allEvidence = [...(log?.evidence ?? [])].sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0));
  const professorInfoFound = log?.professor_info_found !== false;
  const isCrossCourse = dossier.sunsetGradeDistribution?.is_cross_course_fallback === true;
  const confColor = confidenceColor(dossier.confidencePercent);

  const sunsetUrl = normalizeSunsetUrl(
    dossier.sunsetGradeDistribution?.source_url,
    isCrossCourse && dossier.sunsetGradeDistribution?.source_course_code
      ? dossier.sunsetGradeDistribution.source_course_code
      : dossier.courseCode,
  );

  // Build logistics pills
  const logPills: { label: string; tone: "green" | "amber" | "muted" }[] = [];
  if (log?.attendance_required === true) logPills.push({ label: "Attendance required", tone: "amber" });
  if (log?.attendance_required === false) logPills.push({ label: "Attendance optional", tone: "green" });
  if (log?.textbook_required === true) logPills.push({ label: "Textbook required", tone: "amber" });
  if (log?.textbook_required === false) logPills.push({ label: "No textbook", tone: "green" });
  if (log?.podcasts_available === true) logPills.push({ label: "Podcasts available", tone: "green" });
  if (log?.podcasts_available === false) logPills.push({ label: "No podcasts", tone: "muted" });

  return (
    <div className="flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] bg-[#0d1b2e] px-6 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-[family-name:var(--font-outfit)] text-xl font-bold tracking-tight text-hub-text">
              {dossier.courseCode}
            </span>
            {isDossierRemoteOnly(dossier) && (
              <span className="rounded-full border border-purple-400/30 bg-purple-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-purple-300">
                Remote
              </span>
            )}
            <span className="text-sm font-normal text-hub-text-muted">{dossier.courseTitle}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-hub-cyan/30 bg-hub-cyan/10 text-[10px] font-bold text-hub-cyan">
              {dossier.professorInitials}
            </span>
            <span className="text-sm text-hub-text-secondary">{dossier.professorName}</span>
            {!professorInfoFound && (
              <span className="flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-900/15 px-2 py-0.5 text-[9px] font-semibold text-amber-400">
                <Info className="h-2.5 w-2.5" /> No specific data found
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {/* Course dots — clickable navigation */}
          {total > 1 && (
            <div className="flex items-center gap-1.5">
              {Array.from({ length: total }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onNavigate(i)}
                  aria-label={`Go to course ${i + 1}`}
                  aria-current={i === index ? "true" : undefined}
                  className={`rounded-full transition-all duration-200 ${
                    i === index
                      ? "h-2 w-4 bg-hub-cyan cursor-default"
                      : "h-1.5 w-1.5 bg-white/20 hover:bg-white/40 cursor-pointer"
                  }`}
                />
              ))}
              <span className="ml-1 font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-hub-text-muted">
                {index + 1}/{total}
              </span>
            </div>
          )}

          {/* Confidence badge */}
          <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-hub-bg/50 px-2.5 py-1.5">
            <div className="h-1.5 w-12 overflow-hidden rounded-full bg-hub-bg/80">
              <div className="h-full rounded-full" style={{ width: `${dossier.confidencePercent}%`, backgroundColor: confColor }} />
            </div>
            <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-semibold tabular-nums" style={{ color: confColor }}>
              {dossier.confidencePercent}%
            </span>
            <HelpCircle className="h-3 w-3 text-hub-text-muted/40" />
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.07] text-hub-text-muted transition hover:border-white/20 hover:text-hub-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto hub-scroll">
        <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-3">

          {/* ── Col 1: Professor + RMP + Sentiment ── */}
          <div className="flex flex-col gap-4">

            {/* No professor info — general overview */}
            {!professorInfoFound && (log?.general_course_overview || log?.general_professor_overview) && (
              <Section label="General overview" accent="text-amber-400/80">
                {log.general_course_overview && (
                  <p className="mb-3 text-xs leading-relaxed text-hub-text-secondary">
                    {log.general_course_overview}
                  </p>
                )}
                {log.general_professor_overview && (
                  <>
                    <p className="mb-1 text-[10px] font-medium text-hub-text-muted/70">
                      About {dossier.professorName}
                    </p>
                    <p className="text-xs leading-relaxed text-hub-text-secondary">
                      {log.general_professor_overview}
                    </p>
                  </>
                )}
              </Section>
            )}

            {/* RMP stats */}
            {hasRmp ? (
              <Section label="Rate My Professor" accent="text-hub-gold">
                <div className="space-y-2">
                  {rmp.rating != null && (
                    <RmpStat
                      icon={<Star className="h-4 w-4 text-hub-gold" fill="currentColor" />}
                      value={rmp.rating.toFixed(1)}
                      label="Rating / 5"
                    />
                  )}
                  {rmp.difficulty != null && (
                    <RmpStat
                      icon={<Zap className="h-4 w-4 text-orange-400" />}
                      value={rmp.difficulty.toFixed(1)}
                      label="Difficulty"
                    />
                  )}
                  {rmp.would_take_again_percent != null && (
                    <RmpStat
                      icon={<RotateCcw className="h-4 w-4 text-emerald-400" />}
                      value={`${Math.round(rmp.would_take_again_percent)}%`}
                      label="Would retake"
                    />
                  )}
                </div>
                {rmp.url && (
                  <a href={rmp.url} target="_blank" rel="noopener noreferrer"
                    className="mt-3 flex items-center gap-1 text-[10px] text-hub-cyan hover:underline">
                    RateMyProf <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </Section>
            ) : (
              <Section label="Rate My Professor" accent="text-hub-gold">
                <p className="text-xs text-hub-text-muted">No RMP data found for this professor.</p>
              </Section>
            )}

            {/* Student sentiment */}
            {dossier.tldr && (
              <Section label="Student sentiment" accent="text-hub-cyan">
                <p className="text-sm leading-relaxed text-hub-text-secondary italic">
                  &ldquo;{sanitizeDashes(dossier.tldr)}&rdquo;
                </p>
              </Section>
            )}
          </div>

          {/* ── Col 2: Grade Distribution ── */}
          <div className="flex flex-col gap-4">
            {isCrossCourse && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-900/10 px-3 py-2.5">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400/80" />
                <div>
                  <p className="text-[10px] font-semibold text-amber-400/90">
                    Data from {dossier.sunsetGradeDistribution?.source_course_code ?? "another course"}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-amber-300/70">
                    {dossier.professorName} has not taught {dossier.courseCode} before —
                    {" "}showing grades from {dossier.sunsetGradeDistribution?.source_course_code} as reference.
                  </p>
                </div>
              </div>
            )}

            {hasGrades ? (
              <Section
                label={isCrossCourse
                  ? `Grade dist · ${dossier.sunsetGradeDistribution?.source_course_code ?? "Other course"}`
                  : "Grade distribution"}
                accent="text-hub-cyan"
                className="flex-1"
              >
                {/* GPA headline */}
                {sunsetSummary?.average_gpa != null && (
                  <div className="mb-4 flex items-end gap-3">
                    <div>
                      <p className="font-[family-name:var(--font-jetbrains-mono)] text-4xl font-bold tabular-nums text-hub-cyan leading-none">
                        {sunsetSummary.average_gpa}
                      </p>
                      <p className="mt-0.5 text-[9px] uppercase tracking-wider text-hub-text-muted">Avg GPA</p>
                    </div>
                    {dossier.sunsetGradeDistribution?.recommend_professor_percent != null && (
                      <div className="ml-auto text-right">
                        <p className="font-[family-name:var(--font-jetbrains-mono)] text-2xl font-bold tabular-nums text-emerald-400">
                          {Math.round(dossier.sunsetGradeDistribution.recommend_professor_percent)}%
                        </p>
                        <p className="text-[9px] uppercase tracking-wider text-hub-text-muted">Recommend</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Histogram */}
                {sampleSize > 0 && Object.keys(sunsetSummary?.grade_counts ?? {}).length > 0 && (
                  <div className="mb-4">
                    <GradeHistogram gradeCounts={sunsetSummary?.grade_counts ?? {}} sampleSize={sampleSize} />
                  </div>
                )}

                {/* Grade group bars */}
                <div className="space-y-2">
                  {GRADE_GROUPS.map((group, i) => {
                    const total = group.grades.reduce((s, g) => s + (sunsetSummary?.grade_counts?.[g] ?? 0), 0);
                    if (total === 0 || !sampleSize) return null;
                    const pct = (total / sampleSize) * 100;
                    return (
                      <div key={group.label}>
                        <div className="mb-0.5 flex items-center justify-between text-[10px]">
                          <span className="font-semibold" style={{ color: group.color }}>{group.label}</span>
                          <span className="font-[family-name:var(--font-jetbrains-mono)] tabular-nums text-hub-text-muted">
                            {pct >= 1 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-hub-bg/80">
                          <motion.div
                            className="h-full rounded-full"
                            initial={reduce ? false : { width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 + i * 0.07 }}
                            style={{ backgroundColor: group.color, opacity: 0.75 }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Metadata */}
                <div className="mt-3 flex items-center gap-3 text-[10px] text-hub-text-muted">
                  {dossier.sunsetGradeDistribution?.term_label && (
                    <span className="font-[family-name:var(--font-jetbrains-mono)]">
                      {dossier.sunsetGradeDistribution.term_label}
                    </span>
                  )}
                  {sampleSize > 0 && <span>{sampleSize} students</span>}
                  {sunsetUrl && (
                    <a href={sunsetUrl} target="_blank" rel="noopener noreferrer"
                      className="ml-auto flex items-center gap-1 transition hover:text-hub-cyan">
                      SunSET <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
              </Section>
            ) : (
              <Section label="Grade distribution" accent="text-hub-cyan" className="flex-1">
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="mb-2 h-8 w-8 rounded-full border border-dashed border-white/[0.1] flex items-center justify-center">
                    <span className="text-lg text-hub-text-muted/30">∅</span>
                  </div>
                  <p className="text-xs text-hub-text-muted">No grade distribution data.</p>
                  {isCrossCourse === false && (
                    <p className="mt-1 text-[10px] text-hub-text-muted/60">
                      SunSET may not have data for this specific offering.
                    </p>
                  )}
                </div>
              </Section>
            )}
          </div>

          {/* ── Col 3: Evidence / Insights ── */}
          <div className="flex flex-col gap-4">
            <Section
              label={allEvidence.length > 0 ? `Insights · ${allEvidence.length} sources` : "Insights"}
              accent="text-hub-text-muted"
              className="flex-1"
            >
              {allEvidence.length > 0 ? (
                <div className="space-y-2.5 overflow-y-auto hub-scroll" style={{ maxHeight: "360px" }}>
                  {allEvidence.map((item, i) => (
                    <EvidenceEntry key={i} item={item} />
                  ))}
                </div>
              ) : log != null ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-xs text-hub-text-muted">No direct quotes or sources found.</p>
                  {log.general_course_overview && (
                    <p className="mt-3 text-xs leading-relaxed text-hub-text-secondary">
                      {log.general_course_overview}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {[1,2,3].map((i) => (
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
            </Section>
          </div>
        </div>

        {/* ── Bottom row: Course logistics ── */}
        {(log || logPills.length > 0) && (
          <div className="border-t border-white/[0.06] px-5 pb-5">
            <div className="grid grid-cols-1 gap-4 pt-4 md:grid-cols-2">

              {/* Grade breakdown */}
              <div className="rounded-xl border border-white/[0.07] bg-[#0d1b2e] px-4 py-3">
                <p className="mb-2 text-[10px] font-semibold text-hub-text-muted">
                  Grading
                </p>
                {log?.grade_breakdown ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {log.grade_breakdown.split(/[,;]/).map((s) => s.trim()).filter(Boolean).map((seg, i) => (
                      <span key={i} className="text-xs text-hub-text-secondary">{seg}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-hub-text-muted/60">Grade breakdown not found</p>
                )}
                {/* Course page link */}
                {log?.course_webpage_url && (
                  <a href={log.course_webpage_url} target="_blank" rel="noopener noreferrer"
                    className="mt-2 flex items-center gap-1 text-[10px] text-hub-cyan hover:underline">
                    Course page <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>

              {/* Attribute pills */}
              <div className="rounded-xl border border-white/[0.07] bg-[#0d1b2e] px-4 py-3">
                <p className="mb-2 text-[10px] font-semibold text-hub-text-muted">
                  Course attributes
                </p>
                {logPills.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {logPills.map((p) => (
                      <LogisticPill key={p.label} label={p.label} tone={p.tone} />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-hub-text-muted/60">Attribute data not found</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
