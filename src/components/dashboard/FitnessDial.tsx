"use client";

import { TrendingUp } from "lucide-react";
import type { ScheduleEvaluation } from "@/types/dossier";

type FitnessDialProps = {
  evaluation: ScheduleEvaluation;
};

export function FitnessDial({ evaluation }: FitnessDialProps) {
  const pct = Math.min(
    1,
    Math.max(0, evaluation.fitnessScore / evaluation.fitnessMax),
  );
  const angle = pct * 180;
  const r = 52;
  const cx = 60;
  const cy = 56;

  const describeArc = () => {
    const startX = cx - r;
    const startY = cy;
    const endAngle = (angle * Math.PI) / 180;
    const endX = cx + r * Math.cos(Math.PI - endAngle);
    const endY = cy - r * Math.sin(Math.PI - endAngle);
    const largeArc = angle > 180 ? 1 : 0;
    return `M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}`;
  };

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative h-[120px] w-[120px]">
        <svg
          viewBox="0 0 120 72"
          className="w-full overflow-visible"
          aria-hidden
        >
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            d={describeArc()}
            fill="none"
            stroke="url(#dialGrad)"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id="dialGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#00d4ff" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1 text-center">
          <p className="font-[family-name:var(--font-outfit)] text-2xl font-bold text-hub-text">
            {evaluation.fitnessScore.toFixed(1)}
            <span className="text-sm font-medium text-hub-text-muted">
              {" "}
              / {evaluation.fitnessMax}
            </span>
          </p>
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-hub-text-muted">
            Schedule fitness
          </p>
        </div>
      </div>
      <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-200">
        <TrendingUp className="h-3 w-3" aria-hidden />
        {evaluation.trendLabel}
      </div>
    </div>
  );
}
