"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
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
import type { ScheduleEvaluation } from "@/types/dossier";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number, max: number): string {
  const pct = score / max;
  if (pct <= 0.4) return "#5eead4"; // hub-success
  if (pct <= 0.65) return "#e3b12f"; // hub-gold
  return "#f05a5a"; // hub-danger
}

function trendBadgeClass(score: number, max: number): string {
  const pct = score / max;
  if (pct <= 0.4) return "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";
  if (pct <= 0.65) return "border-amber-400/25 bg-amber-400/10 text-amber-300";
  return "border-red-400/25 bg-red-400/10 text-red-300";
}

/** Rough percentile: score/max → "harder than X% of UCSD schedules" */
function toPercentile(score: number, max: number): number {
  const t = score / max;
  // Slightly concave so mid-scores feel meaningful
  return Math.round(Math.min(99, Math.max(1, t * t * 40 + t * 58 + 1)));
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
// Advisor note bullet parsing & entity highlighting
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

type BulletSeverity = "danger" | "warning" | "ok";

function detectSeverity(text: string): BulletSeverity {
  const lower = text.toLowerCase();
  if (
    /\b(no podcast|hard|heavy|mandatory|critical|overload|exam conflict|no drops|high workload)\b/.test(lower)
  ) return "danger";
  if (
    /\b(moderate|consider|recommend|attendance|limited|may|potential|watch|note)\b/.test(lower)
  ) return "warning";
  return "ok";
}

const SEVERITY_ICON: Record<BulletSeverity, React.ReactNode> = {
  danger: <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#f05a5a]" />,
  warning: <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#e3b12f]" />,
  ok: <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#5eead4]" />,
};

function splitBullets(text: string): string[] {
  return text
    .split(/\.\s+/)
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter((s) => s.length > 8);
}


// ---------------------------------------------------------------------------
// Tooltip (overflow-safe — rendered above the card via z-50)
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

function ScoreRadar({ data, color, height = 260 }: { data: RadarDatum[]; color: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart cx="50%" cy="50%" outerRadius="85%" data={data}>
        <PolarGrid stroke="rgba(255,255,255,0.07)" />
        <PolarAngleAxis
          dataKey="subject"
          tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 700 }}
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
  const percentile = toPercentile(evaluation.fitnessScore, evaluation.fitnessMax);
  const cats = evaluation.categories ?? [];
  const bullets = evaluation.recommendation ? splitBullets(evaluation.recommendation) : [];

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

  return (
    <section
      className="w-full rounded-2xl border border-white/[0.10] shadow-2xl"
      style={{
        background: "rgba(17, 34, 64, 0.55)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <h2 className="font-[family-name:var(--font-outfit)] text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">
            Quarter Dossier
          </h2>
          <HudInfoTooltip text="Graded based on difficulty of classes, schedule timing, and workload" />
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
        <div className={`flex shrink-0 flex-col ${isHero ? "w-60 px-8 py-8" : "w-full px-6 py-6 sm:w-52 sm:px-6 sm:py-6"}`}>
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

          {/* Percentile sub-header */}
          <motion.p
            className="mt-2 text-[11px] leading-snug text-white/50"
            initial={reduce ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            Harder than{" "}
            <span className="font-semibold" style={{ color }}>
              {percentile}%
            </span>{" "}
            of UCSD schedules
          </motion.p>

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
            <ScoreRadar data={radarData} color={color} height={isHero ? 340 : 260} />
          </div>
        ) : (
          // Fallback category sparklines when no radar data
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
        <div className="flex flex-wrap gap-2 border-t border-white/[0.06] px-5 py-3">
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

      {/* ── Advisor notes ──────────────────────────────────────────────────── */}
      {bullets.length > 0 && (
        <div className="border-t border-white/[0.06] px-5 py-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-white/35">
            Advisor Notes
          </p>
          <ul className="space-y-2.5">
            {bullets.map((b, i) => {
              const sev = detectSeverity(b);
              return (
                <li key={i} className="flex items-start gap-2.5">
                  {SEVERITY_ICON[sev]}
                  <span className="text-[12.5px] leading-[1.6] text-white/70">
                    <HighlightedText text={`${b}.`} />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── Quick actions ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 border-t border-white/[0.06] px-5 py-3">
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
