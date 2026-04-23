import type { ScheduleItem } from "@/types/dossier";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

type WeeklyScheduleProps = {
  scheduleItems: ScheduleItem[];
};

function getKindClasses(kind: ScheduleItem["kind"]) {
  if (kind === "class") {
    return "border-hub-cyan/30 bg-hub-cyan/10 text-hub-cyan";
  }
  if (kind === "work") {
    return "border-purple-400/30 bg-purple-400/10 text-purple-300";
  }
  return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
}

function formatTime(time24: string) {
  const value = time24.trim();

  const ampmMatch = value.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (ampmMatch) {
    const hour = Number(ampmMatch[1]);
    const minute = ampmMatch[2] ?? "00";
    const suffix = ampmMatch[3].toUpperCase();
    return `${hour}:${minute} ${suffix}`;
  }

  const h24Match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!h24Match) return time24;

  const hour = Number(h24Match[1]);
  const minute = h24Match[2];
  if (Number.isNaN(hour)) return time24;

  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minute} ${suffix}`;
}

export function WeeklySchedule({ scheduleItems }: WeeklyScheduleProps) {
  const grouped = DAYS.map((day) => ({
    day,
    items: scheduleItems
      .filter((item) => item.day === day)
      .sort((a, b) => a.start.localeCompare(b.start)),
  }));

  return (
    <section className="glass-panel rounded-xl border border-white/[0.08] p-4">
      <div className="mb-4">
        <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-hub-text">
          Weekly schedule
        </h2>
        <p className="mt-1 text-sm text-hub-text-secondary">
          View classes and non-class commitments in one place.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {grouped.map(({ day, items }) => (
          <div
            key={day}
            className="rounded-xl border border-white/[0.08] bg-hub-bg/30 p-3"
          >
            <div className="mb-3 border-b border-white/[0.06] pb-2">
              <p className="text-sm font-semibold text-hub-text">{day}</p>
            </div>

            <div className="space-y-2">
              {items.length ? (
                items.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-lg border p-3 ${getKindClasses(item.kind)}`}
                  >
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 text-xs opacity-80">
                      {formatTime(item.start)} - {formatTime(item.end)}
                    </p>
                    {item.location ? (
                      <p className="mt-1 text-xs opacity-80">{item.location}</p>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-xs text-hub-text-muted">No events</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
