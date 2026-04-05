import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import type { ScheduleEvaluation } from "@/types/dossier";
import { FitnessDial } from "@/components/dashboard/FitnessDial";

type EvaluatorFooterProps = {
  evaluation: ScheduleEvaluation;
};

function SeverityIcon({ severity }: { severity: ScheduleEvaluation["alerts"][0]["severity"] }) {
  switch (severity) {
    case "critical":
      return <AlertCircle className="h-4 w-4 text-hub-danger" aria-hidden />;
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-hub-gold" aria-hidden />;
    default:
      return <Info className="h-4 w-4 text-hub-cyan" aria-hidden />;
  }
}

export function EvaluatorFooter({ evaluation }: EvaluatorFooterProps) {
  return (
    <section className="mt-8 rounded-xl border border-white/[0.08] bg-hub-surface/95 p-4">
      <div className="mb-4 border-b border-white/[0.06] pb-3">
        <h2 className="font-[family-name:var(--font-outfit)] text-base font-semibold text-hub-text">
          Schedule Evaluation
        </h2>
        <p className="mt-1 text-sm text-hub-text-secondary">
          Combined commute, employment hours, and density alerts for this
          quarter.
        </p>
      </div>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex items-center justify-center border-b border-white/[0.06] pb-6 lg:w-[300px] lg:shrink-0 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6">
          <FitnessDial evaluation={evaluation} />
        </div>
        <div className="flex-1">
          <ul className="space-y-3">
            {evaluation.alerts.map((a) => (
              <li
                key={a.id}
                className="flex gap-3 rounded-lg border border-white/[0.06] bg-hub-bg/35 p-3"
              >
                <div className="mt-0.5 shrink-0">
                  <SeverityIcon severity={a.severity} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-hub-text">{a.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-hub-text-secondary">
                    {a.detail}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          {evaluation.recommendation && (
            <div className="mt-4 rounded-lg border border-white/[0.06] bg-hub-bg/25 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-hub-text-muted mb-1">
                Advisor recommendation
              </p>
              <p className="text-sm leading-relaxed text-hub-text-secondary">
                {evaluation.recommendation}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
