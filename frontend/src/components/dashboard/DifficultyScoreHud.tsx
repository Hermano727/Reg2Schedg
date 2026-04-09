"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import type { ScheduleEvaluation } from "@/types/dossier";

function fitnessScoreColor(score: number, max: number): string {
  const pct = score / max;
  if (pct <= 0.4) return "#5eead4";
  if (pct <= 0.65) return "#e3b12f";
  return "#ff6b6b";
}

function trendLabelStyle(score: number, max: number): string {
  const pct = score / max;
  if (pct <= 0.4) return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  if (pct <= 0.65) return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  return "border-red-400/20 bg-red-400/10 text-red-300";
}

// Counts up from 0 → target with ease-out-quart
function useCountUp(target: number, duration = 900) {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (reduce) { setValue(target); return; }
    setValue(0);
    const startTime = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setValue(target * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduce]);

  return reduce ? target : value;
}

function HudInfoTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className="flex items-center text-slate-400/60 transition hover:text-slate-400"
        aria-label="Score explanation"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {visible && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-56 -translate-x-1/2 rounded-lg border border-white/[0.12] bg-hub-surface p-2.5 text-[11px] leading-relaxed text-hub-text-secondary shadow-xl">
          {text}
        </div>
      )}
    </div>
  );
}

type Props = { evaluation: ScheduleEvaluation };

export function DifficultyScoreHud({ evaluation }: Props) {
  const reduce = useReducedMotion();
  const displayScore = useCountUp(evaluation.fitnessScore);
  const scoreColor = fitnessScoreColor(evaluation.fitnessScore, evaluation.fitnessMax);

  return (
    <section className="w-full rounded-xl border border-white/[0.08] bg-hub-surface/95 shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="font-[family-name:var(--font-outfit)] text-sm font-semibold text-hub-text-muted">
            Difficulty score
          </h2>
          <HudInfoTooltip text="Commute · density · employment — 1 = easy, 10 = very hard" />
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${trendLabelStyle(evaluation.fitnessScore, evaluation.fitnessMax)}`}>
          {evaluation.trendLabel}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-6 px-4 py-4">
        {/* Score readout with entrance animation */}
        <div className="flex items-baseline gap-2">
          <motion.span
            className="font-[family-name:var(--font-outfit)] text-5xl font-bold tabular-nums"
            style={{ color: scoreColor }}
            initial={reduce ? false : { opacity: 0, scale: 0.75 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 280, damping: 22, delay: 0.05 }}
          >
            {displayScore.toFixed(1)}
          </motion.span>
          <span className="text-sm text-slate-400">/ {evaluation.fitnessMax}</span>
        </div>

        {/* Category mini-bars with animated widths */}
        {(evaluation.categories ?? []).length > 0 && (
          <div className="flex flex-1 flex-wrap gap-x-6 gap-y-3">
            {(evaluation.categories ?? []).map((cat, i) => (
              <div key={cat.label} className="min-w-[100px] flex-1">
                <div className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="flex items-center gap-1.5 font-medium text-slate-400">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: cat.color }} />
                    {cat.label}
                  </span>
                  <span className="font-bold tabular-nums" style={{ color: cat.color }}>
                    {cat.score.toFixed(1)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <motion.div
                    className="h-full rounded-full"
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width: `${(cat.score / cat.max) * 100}%` }}
                    transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1], delay: 0.2 + i * 0.07 }}
                    style={{ backgroundColor: cat.color, opacity: 0.8 }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Alert chips */}
        {evaluation.alerts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {evaluation.alerts.slice(0, 3).map((a) => (
              <span
                key={a.id}
                title={a.detail}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                  a.severity === "critical"
                    ? "border-hub-danger/25 bg-hub-danger/10 text-hub-danger"
                    : a.severity === "warning"
                    ? "border-hub-gold/25 bg-hub-gold/10 text-hub-gold"
                    : "border-hub-cyan/20 bg-hub-cyan/8 text-hub-cyan"
                }`}
              >
                {a.severity === "critical" ? (
                  <AlertCircle className="h-3 w-3" aria-hidden />
                ) : a.severity === "warning" ? (
                  <AlertTriangle className="h-3 w-3" aria-hidden />
                ) : (
                  <Info className="h-3 w-3" aria-hidden />
                )}
                {a.title}
              </span>
            ))}
            {evaluation.alerts.length > 3 && (
              <span className="inline-flex items-center rounded-full border border-white/[0.08] px-2.5 py-1 text-[10px] text-slate-400">
                +{evaluation.alerts.length - 3} more
              </span>
            )}
          </div>
        )}
      </div>

      {evaluation.recommendation && (
        <div className="border-t border-white/[0.05] px-4 py-2.5">
          <p className="text-xs text-slate-400">
            <span className="font-semibold text-hub-text-secondary">Advisor: </span>
            {evaluation.recommendation}
          </p>
        </div>
      )}
    </section>
  );
}
