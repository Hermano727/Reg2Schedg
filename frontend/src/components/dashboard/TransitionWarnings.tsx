import type { ScheduleItem, TransitionInsight } from "@/types/dossier";
import { campusLocations } from "@/lib/mock/campusLocations";

type TransitionWarningsProps = {
  transitionInsights: TransitionInsight[];
  scheduleItems: ScheduleItem[];
};

const PIXEL_TO_METERS = 2.4;
const CURVE_FACTOR = 1.08;

function getRiskClasses(risk: TransitionInsight["risk"]) {
  if (risk === "safe") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  }
  if (risk === "tight") {
    return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  }
  return "border-rose-400/30 bg-rose-400/10 text-rose-300";
}

function formatDistanceMiles(meters: number) {
  const miles = meters / 1609.34;
  return `${miles.toFixed(2)} mi`;
}

export function TransitionWarnings({
  transitionInsights,
  scheduleItems,
}: TransitionWarningsProps) {
  const itemMap = new Map(scheduleItems.map((item) => [item.id, item]));
  const locationMap = new Map(campusLocations.map((loc) => [loc.code, loc]));

  return (
    <section className="glass-panel rounded-xl border border-white/[0.08] p-4">
      <div className="mb-4">
        <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-hub-text">
          Transition warnings
        </h2>
        <p className="mt-1 text-sm text-hub-text-secondary">
          Catch unrealistic gaps between classes, work, and other commitments.
        </p>
      </div>

      <div className="space-y-3">
        {transitionInsights.map((transition) => {
          const fromItem = itemMap.get(transition.fromId);
          const toItem = itemMap.get(transition.toId);

          const fromLoc = fromItem?.buildingCode
            ? locationMap.get(fromItem.buildingCode)
            : null;
          const toLoc = toItem?.buildingCode
            ? locationMap.get(toItem.buildingCode)
            : null;

          const estimatedMeters =
            fromLoc && toLoc
              ? Math.round(
                  Math.hypot(toLoc.x - fromLoc.x, toLoc.y - fromLoc.y) *
                    PIXEL_TO_METERS *
                    CURVE_FACTOR,
                )
              : null;

          return (
            <div
              key={transition.id}
              className="rounded-xl border border-white/[0.08] bg-hub-bg/30 p-4"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-hub-text-muted">
                    After
                  </p>
                  <p className="text-sm font-semibold text-hub-text truncate">
                    {fromItem?.title ?? "Unknown"}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-hub-text-muted">
                    Head to
                  </p>
                  <p className="text-sm font-semibold text-hub-text truncate">
                    {toItem?.title ?? "Unknown"}
                  </p>
                </div>
                <span
                  className={`mt-0.5 shrink-0 rounded-full border px-2 py-1 text-xs font-medium capitalize ${getRiskClasses(transition.risk)}`}
                >
                  {transition.risk}
                </span>
              </div>

              {estimatedMeters ? (
                <p className="text-xs text-hub-text-secondary">
                  Est {formatDistanceMiles(estimatedMeters)}
                </p>
              ) : (
                <p className="text-xs text-hub-text-secondary">
                  Est distance unavailable (missing building mapping)
                </p>
              )}

              <p className="mt-1 text-xs text-hub-text-secondary">
                Gap: {transition.gapMinutes} min · Walk: {transition.walkMinutes} min
              </p>

              <p className="mt-2 text-sm text-hub-text-muted">
                {transition.detail}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
