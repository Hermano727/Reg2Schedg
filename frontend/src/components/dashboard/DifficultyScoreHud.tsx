"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Info,
  LayoutGrid,
} from "lucide-react";
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import type { ScheduleEvaluation, UserInputFeedback } from "@/types/dossier";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number, max: number): string {
  const pct = score / max;
  if (pct <= 0.4) return "#5eead4";
  if (pct <= 0.65) return "#e3b12f";
  return "#f05a5a";
}

function trendBadgeClass(score: number, max: number): string {
  const pct = score / max;
  if (pct <= 0.4) return "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";
  if (pct <= 0.65) return "border-amber-400/25 bg-amber-400/10 text-amber-300";
  return "border-red-400/25 bg-red-400/10 text-red-300";
}

function useCountUp(target: number, duration = 900) {
  const reduce = useReducedMotion();
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (reduce) { setVal(target); return; }
    setVal(0);
    const t0 = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      setVal(target * (1 - Math.pow(1 - p, 4)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduce]);
  return reduce ? target : val;
}

// ---------------------------------------------------------------------------
// Bullet helpers
// ---------------------------------------------------------------------------

const COURSE_CODE_RE = /\b([A-Z]{2,6}\s*\d{2,3}[A-Z]?)\b/g;

function HighlightedText({ text }: { text: string }) {
  const parts: Array<{ text: string; highlight: boolean }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  COURSE_CODE_RE.lastIndex = 0;
  while ((m = COURSE_CODE_RE.exec(text)) !== null) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), highlight: false });
    parts.push({ text: m[0], highlight: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), highlight: false });
  return (
    <>
      {parts.map((p, i) =>
        p.highlight ? (
          <strong key={i} className="font-semibold text-[#00d4ff]">{p.text}</strong>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/** Normalize string | string[] → string[] for both old and new API formats. */
function toBullets(value: string[] | string | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((s) => s.trim().length > 0);
  return value
    .split(/\.\s+/)
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter((s) => s.length > 8);
}

/** Normalize the userInputFeedback field — handles new structured and legacy flat formats. */
function toUserInputFeedback(
  value: UserInputFeedback | string[] | string | undefined,
): UserInputFeedback | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as UserInputFeedback;
  // Legacy flat list → dump everything into practical_risks
  return { academic_alignment: [], practical_risks: toBullets(value as string[] | string) };
}

type BulletSeverity = "danger" | "warning" | "ok";

function detectSeverity(text: string): BulletSeverity {
  const lower = text.toLowerCase();
  if (/\b(no podcast|hard|heavy|mandatory|critical|overload|exam conflict|no drops|high workload)\b/.test(lower))
    return "danger";
  if (/\b(moderate|consider|recommend|attendance|limited|may|potential|watch|note)\b/.test(lower))
    return "warning";
  return "ok";
}

const RISK_ICON: Record<BulletSeverity, React.ReactNode> = {
  danger: <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#f05a5a]" />,
  warning: <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#e3b12f]" />,
  ok: <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#5eead4]" />,
};

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

function HudInfoTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className="flex items-center text-white/30 transition hover:text-white/60"
        aria-label="Score explanation"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {visible && (
        <div
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-60 -translate-x-1/2 rounded-lg border border-white/[0.14] bg-[#0d1f38] px-3 py-2.5 text-[11px] leading-relaxed text-white/70 shadow-2xl"
          style={{ backdropFilter: "blur(12px)" }}
        >
          {text}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Radar chart
// ---------------------------------------------------------------------------

type RadarDatum = { subject: string; value: number; fullMark: number };

function ScoreRadar({ data, color, height = 299 }: { data: RadarDatum[]; color: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart cx="50%" cy="50%" outerRadius="88%" data={data}>
        <PolarGrid stroke="rgba(255,255,255,0.07)" />
        <PolarAngleAxis
          dataKey="subject"
          tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 700 }}
        />
        <Radar
          name="Score"
          dataKey="value"
          stroke={color}
          fill={color}
          fillOpacity={0.22}
          strokeWidth={2}
          dot={{ r: 4, fill: color, strokeWidth: 0 }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Props = {
  evaluation: ScheduleEvaluation;
  isHero?: boolean;
  onGoToCourses?: () => void;
  onOpenCalendar?: () => void;
};

export function DifficultyScoreHud({ evaluation, isHero = false, onGoToCourses, onOpenCalendar }: Props) {
  const reduce = useReducedMotion();
  const displayScore = useCountUp(evaluation.fitnessScore);
  const color = scoreColor(evaluation.fitnessScore, evaluation.fitnessMax);
  const cats = evaluation.categories ?? [];
  const bullets = toBullets(evaluation.recommendation);
  const goalFeedback = toUserInputFeedback(evaluation.userInputFeedback);
  const hasGoalFeedback = Boolean(
    goalFeedback &&
    (goalFeedback.academic_alignment.length > 0 || goalFeedback.practical_risks.length > 0),
  );

  const radarData: RadarDatum[] = cats.map((c) => ({
    subject: c.label,
    value: Math.round((c.score / c.max) * 10),
    fullMark: 10,
  }));

  const now = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const quickActions = [
    { icon: <LayoutGrid className="h-3.5 w-3.5" />, label: "View Courses", onClick: onGoToCourses },
    { icon: <CalendarDays className="h-3.5 w-3.5" />, label: "Calendar", onClick: onOpenCalendar },
  ];

  const hasStudyLoad = (evaluation.studyHoursMin ?? 0) > 0 && (evaluation.studyHoursMax ?? 0) > 0;

  return (
    <section
      className="w-full rounded-2xl border border-white/[0.13] shadow-2xl"
      style={{
        background: "rgba(17, 34, 64, 0.92)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.05) inset, 0 8px 32px rgba(0,0,0,0.4)",
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-4">
        <div className="flex items-center gap-2.5">
          <h2
            className="font-[family-name:var(--font-outfit)] font-bold text-white/90"
            style={{ fontSize: "26px", letterSpacing: "-0.02em" }}
          >
            Quarter Difficulty
          </h2>
          <HudInfoTooltip text="Graded on class difficulty, schedule timing, and total workload" />
        </div>
        <div className="flex items-center gap-3">
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-white/30">
            {now}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${trendBadgeClass(evaluation.fitnessScore, evaluation.fitnessMax)}`}
          >
            {evaluation.trendLabel}
          </span>
        </div>
      </div>

      {/* ── Primary score + radar ───────────────────────────────────────────── */}
      <div className={`flex items-center gap-0 ${isHero ? "flex-row" : "flex-col sm:flex-row"}`}>
        {/* Score block */}
        <div className={`flex shrink-0 flex-col ${isHero ? "w-64 px-8 py-8" : "w-full px-6 py-6 sm:w-56 sm:px-6 sm:py-6"}`}>
          <span className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/35">
            Difficulty Score
          </span>

          <div className="flex items-baseline gap-2">
            <motion.span
              className={`font-[family-name:var(--font-outfit)] font-bold tabular-nums leading-none ${isHero ? "text-7xl" : "text-6xl"}`}
              style={{ color }}
              initial={reduce ? false : { opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 22, delay: 0.05 }}
            >
              {displayScore.toFixed(1)}
            </motion.span>
            <span className="font-[family-name:var(--font-jetbrains-mono)] text-sm text-white/30">
              / {evaluation.fitnessMax}
            </span>
          </div>

          {/* Study load stat (replaces percentile) */}
          <motion.div
            className="mt-2.5 flex items-center gap-1.5"
            initial={reduce ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <BookOpen className="h-3 w-3 text-white/30" />
            <span className="text-[11px] text-white/50">
              Est. study load:{" "}
              {hasStudyLoad ? (
                <span className="font-semibold text-white/70">
                  {evaluation.studyHoursMin}–{evaluation.studyHoursMax} hrs/wk
                </span>
              ) : (
                <span className="text-white/30">—</span>
              )}
            </span>
          </motion.div>

          {/* Thin score bar */}
          <div className="mt-4 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.07]">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}80` }}
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${(evaluation.fitnessScore / evaluation.fitnessMax) * 100}%` }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            />
          </div>
        </div>

        {/* Divider */}
        <div className={`shrink-0 bg-white/[0.06] ${isHero ? "h-auto w-px self-stretch" : "h-px w-full sm:h-auto sm:w-px sm:self-stretch"}`} />

        {/* Radar chart */}
        {radarData.length > 0 ? (
          <div className={`flex flex-1 items-center justify-center ${isHero ? "px-8 py-8" : "px-4 py-4"}`}>
            <ScoreRadar data={radarData} color={color} height={isHero ? 391 : 299} />
          </div>
        ) : (
          <div className={`flex flex-1 flex-col justify-center ${isHero ? "gap-5 px-8 py-8" : "gap-3.5 px-5 py-5"}`}>
            {cats.map((cat, i) => (
              <div key={cat.label} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-white/40">{cat.label}</span>
                <div className="relative h-[2px] flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ backgroundColor: cat.color, boxShadow: `0 0 6px ${cat.color}60` }}
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width: `${(cat.score / cat.max) * 100}%` }}
                    transition={{ duration: 0.7, delay: 0.1 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
                <span
                  className="w-7 shrink-0 text-right font-[family-name:var(--font-jetbrains-mono)] text-sm font-bold tabular-nums"
                  style={{ color: cat.color }}
                >
                  {cat.score.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Alerts ─────────────────────────────────────────────────────────── */}
      {evaluation.alerts.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-white/[0.06] px-6 py-3">
          {evaluation.alerts.map((a) => (
            <span
              key={a.id}
              title={a.detail}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                a.severity === "critical"
                  ? "border-[#f05a5a]/25 bg-[#f05a5a]/10 text-[#f05a5a]"
                  : a.severity === "warning"
                  ? "border-[#e3b12f]/25 bg-[#e3b12f]/10 text-[#e3b12f]"
                  : "border-[#00d4ff]/20 bg-[#00d4ff]/8 text-[#00d4ff]"
              }`}
            >
              {a.severity === "critical" ? (
                <AlertCircle className="h-3.5 w-3.5" aria-hidden />
              ) : a.severity === "warning" ? (
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Info className="h-3.5 w-3.5" aria-hidden />
              )}
              {a.title}
            </span>
          ))}
        </div>
      )}

      {/* ── Advisor notes — plain bullets ──────────────────────────────────── */}
      {bullets.length > 0 && !hasGoalFeedback && (
        <div className="border-t border-white/[0.06] px-6 py-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-white/30">
            Advisor Notes
          </p>
          <ul className="space-y-2">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-white/25" />
                <span className="text-[15px] leading-[1.6] text-white/60">
                  <HighlightedText text={b} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Your goals vs. this schedule — two-column ──────────────────────── */}
      {hasGoalFeedback && goalFeedback && (
        <div className="border-t border-hub-cyan/[0.12] bg-hub-cyan/[0.025] px-6 py-5">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.15em] text-hub-cyan/50">
            Your Goals vs. This Schedule
          </p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* Left: Academic Alignment */}
            {goalFeedback.academic_alignment.length > 0 && (
              <div>
                <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/30">
                  Academic Alignment
                </p>
                <ul className="space-y-2.5">
                  {goalFeedback.academic_alignment.map((b, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#5eead4]" />
                      <span className="text-[15px] leading-[1.6] text-white/70">
                        <HighlightedText text={b} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Right: Practical Risks */}
            {goalFeedback.practical_risks.length > 0 && (
              <div>
                <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/30">
                  Practical Risks
                </p>
                <ul className="space-y-2.5">
                  {goalFeedback.practical_risks.map((b, i) => {
                    const sev = detectSeverity(b);
                    return (
                      <li key={i} className="flex items-start gap-2.5">
                        {RISK_ICON[sev]}
                        <span className="text-[15px] leading-[1.6] text-white/70">
                          <HighlightedText text={b} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Quick actions ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 border-t border-white/[0.06] px-6 py-3">
        {quickActions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-white/50 transition hover:border-[#00d4ff]/30 hover:bg-[#00d4ff]/[0.07] hover:text-[#00d4ff] active:scale-[0.94] active:duration-75"
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>
    </section>
  );
}
