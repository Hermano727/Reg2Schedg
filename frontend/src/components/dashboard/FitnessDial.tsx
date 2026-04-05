"use client";

import { TrendingUp } from "lucide-react";
import type { ScheduleEvaluation } from "@/types/dossier";

type FitnessDialProps = {
  evaluation: ScheduleEvaluation;
};

const GAP_DEG = 5;
const SLICE_DEG = 90 - GAP_DEG; // 85° per category for 4 slices
const OUTER_R = 72;
const INNER_R = 46;
const CX = 90;
const CY = 90;

function polarToXY(r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function donutSlicePath(startAngle: number, sweepAngle: number): string {
  if (sweepAngle <= 0) return "";
  const sweep = Math.min(sweepAngle, 359.99);
  const endAngle = startAngle + sweep;
  const os = polarToXY(OUTER_R, startAngle);
  const oe = polarToXY(OUTER_R, endAngle);
  const is_ = polarToXY(INNER_R, startAngle);
  const ie = polarToXY(INNER_R, endAngle);
  const large = sweep > 180 ? 1 : 0;
  return [
    `M ${os.x.toFixed(2)} ${os.y.toFixed(2)}`,
    `A ${OUTER_R} ${OUTER_R} 0 ${large} 1 ${oe.x.toFixed(2)} ${oe.y.toFixed(2)}`,
    `L ${ie.x.toFixed(2)} ${ie.y.toFixed(2)}`,
    `A ${INNER_R} ${INNER_R} 0 ${large} 0 ${is_.x.toFixed(2)} ${is_.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

export function FitnessDial({ evaluation }: FitnessDialProps) {
  const categories = evaluation.categories ?? [];
  const hasCats = categories.length > 0;

  return (
    <div className="flex flex-col items-center gap-5 w-full">
      {/* Donut chart */}
      <div className="relative">
        <svg
          viewBox="0 0 180 180"
          className="w-[200px] h-[200px]"
          aria-hidden
        >
          <defs>
            {categories.map((cat, i) => (
              <radialGradient key={`rg-${i}`} id={`catFill-${i}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={cat.color} stopOpacity="0.65" />
                <stop offset="100%" stopColor={cat.color} stopOpacity="1" />
              </radialGradient>
            ))}
          </defs>

          {/* Background (dim) track slices */}
          {hasCats
            ? categories.map((_, i) => (
                <path
                  key={`bg-${i}`}
                  d={donutSlicePath(i * 90, SLICE_DEG)}
                  fill="rgba(255,255,255,0.05)"
                  stroke="rgba(255,255,255,0.02)"
                  strokeWidth="1"
                />
              ))
            : (
              // Fallback: single semicircle gauge if no categories
              <path
                d={donutSlicePath(-90, 180)}
                fill="rgba(255,255,255,0.05)"
              />
            )}

          {/* Filled arcs — length proportional to each category score */}
          {categories.map((cat, i) => {
            const filledSweep = (cat.score / cat.max) * SLICE_DEG;
            return (
              <path
                key={`fill-${i}`}
                d={donutSlicePath(i * 90, filledSweep)}
                fill={`url(#catFill-${i})`}
              />
            );
          })}

          {/* Fallback filled arc when no categories */}
          {!hasCats && (
            <path
              d={donutSlicePath(-90, (evaluation.fitnessScore / evaluation.fitnessMax) * 180)}
              fill="url(#legacyGrad)"
            />
          )}
          {!hasCats && (
            <defs>
              <linearGradient id="legacyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#00d4ff" />
              </linearGradient>
            </defs>
          )}

          {/* Center: overall score */}
          <text
            x={CX}
            y={CY - 9}
            textAnchor="middle"
            dominantBaseline="middle"
            style={{
              fontFamily: "var(--font-outfit), sans-serif",
              fontSize: "26px",
              fontWeight: 700,
              fill: "white",
            }}
          >
            {evaluation.fitnessScore.toFixed(1)}
          </text>
          <text
            x={CX}
            y={CY + 14}
            textAnchor="middle"
            dominantBaseline="middle"
            style={{
              fontFamily: "var(--font-outfit), sans-serif",
              fontSize: "9px",
              fontWeight: 500,
              fill: "rgba(255,255,255,0.4)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            out of {evaluation.fitnessMax}
          </text>
        </svg>
      </div>

      {/* Category breakdown legend */}
      {hasCats && (
        <div className="grid grid-cols-2 gap-x-5 gap-y-3 w-full max-w-[260px]">
          {categories.map((cat) => (
            <div key={cat.label} className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-hub-text-muted truncate">
                  {cat.label}
                </span>
              </div>
              <div className="ml-3.5 flex items-center gap-2">
                <span
                  className="text-sm font-bold tabular-nums"
                  style={{ color: cat.color }}
                >
                  {cat.score.toFixed(1)}
                </span>
                <div className="h-1 flex-1 rounded-full bg-white/[0.07] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(cat.score / cat.max) * 100}%`,
                      backgroundColor: cat.color,
                      opacity: 0.7,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Trend badge */}
      <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-200">
        <TrendingUp className="h-3 w-3" aria-hidden />
        {evaluation.trendLabel}
      </div>
    </div>
  );
}
