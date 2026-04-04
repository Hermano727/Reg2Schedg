"use client";

import type { ClassDossier, SectionMeeting } from "@/types/dossier";

const PX_PER_HOUR = 64;
const PX_PER_MIN = PX_PER_HOUR / 60;

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

const PALETTE = [
  {
    border: "border-hub-cyan/60",
    bg: "bg-hub-cyan/10",
    text: "text-hub-cyan",
    dot: "bg-hub-cyan",
  },
  {
    border: "border-purple-400/60",
    bg: "bg-purple-400/10",
    text: "text-purple-300",
    dot: "bg-purple-400",
  },
  {
    border: "border-hub-gold/60",
    bg: "bg-hub-gold/10",
    text: "text-hub-gold",
    dot: "bg-hub-gold",
  },
  {
    border: "border-green-400/60",
    bg: "bg-green-400/10",
    text: "text-green-300",
    dot: "bg-green-400",
  },
] as const;

function parseTimeToMinutes(t: string): number {
  const [timePart, period] = t.trim().split(" ");
  const [hStr, mStr] = timePart.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return h * 60 + m;
}

function parseDaysToCols(days: string): number[] {
  // Map each token to column index (M=0, Tu=1, W=2, Th=3, F=4, Sa=5)
  const map: Record<string, number> = {
    M: 0, Tu: 1, W: 2, Th: 3, F: 4, Sa: 5,
  };
  const cols: number[] = [];
  // Parse in order: Tu, Th before T, Sa before S
  let i = 0;
  while (i < days.length) {
    if (days.startsWith("Tu", i)) { cols.push(1); i += 2; }
    else if (days.startsWith("Th", i)) { cols.push(3); i += 2; }
    else if (days.startsWith("Sa", i)) { cols.push(5); i += 2; }
    else if (days[i] === "M") { cols.push(0); i++; }
    else if (days[i] === "W") { cols.push(2); i++; }
    else if (days[i] === "F") { cols.push(4); i++; }
    else i++;
  }
  return cols;
}

interface MeetingBlock {
  meeting: SectionMeeting;
  color: typeof PALETTE[number];
  courseCode: string;
  col: number;
  startMin: number;
  endMin: number;
}

interface Props {
  classes: ClassDossier[];
}

export function WeeklyCalendar({ classes }: Props) {
  // Collect all blocks
  const blocks: MeetingBlock[] = [];
  let allStart = Infinity;
  let allEnd = -Infinity;

  classes.forEach((dossier, idx) => {
    const color = PALETTE[idx % PALETTE.length];
    dossier.meetings.forEach((meeting) => {
      const startMin = parseTimeToMinutes(meeting.start_time);
      const endMin = parseTimeToMinutes(meeting.end_time);
      if (startMin < allStart) allStart = startMin;
      if (endMin > allEnd) allEnd = endMin;
      parseDaysToCols(meeting.days).forEach((col) => {
        blocks.push({ meeting, color, courseCode: dossier.courseCode, col, startMin, endMin });
      });
    });
  });

  // Fallback if no meetings
  if (blocks.length === 0) return null;

  // Compute range clamped to [8 AM, 10 PM]
  const rangeStart = Math.max(8 * 60, Math.floor((allStart - 30) / 60) * 60);
  const rangeEnd = Math.min(22 * 60, Math.ceil((allEnd + 30) / 60) * 60);
  const totalHours = (rangeEnd - rangeStart) / 60;
  const totalHeight = totalHours * PX_PER_HOUR;

  const hourLabels: number[] = [];
  for (let h = rangeStart / 60; h <= rangeEnd / 60; h++) hourLabels.push(h);

  return (
    <div className="rounded-xl border border-white/[0.08] bg-hub-surface/90 p-4 backdrop-blur-sm">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-hub-text-muted">
        Weekly Schedule
      </h2>
      <div className="overflow-x-auto">
        <div className="min-w-[480px]">
          {/* Day header row */}
          <div className="mb-1 flex">
            <div className="w-10 shrink-0" />
            {DAYS.map((day) => (
              <div
                key={day}
                className="flex-1 text-center text-[11px] font-medium uppercase tracking-wider text-hub-text-muted"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Grid body */}
          <div className="flex">
            {/* Time gutter */}
            <div className="relative w-10 shrink-0" style={{ height: totalHeight }}>
              {hourLabels.map((h) => (
                <div
                  key={h}
                  className="absolute right-2 text-[10px] leading-none text-hub-text-muted"
                  style={{ top: (h * 60 - rangeStart) * PX_PER_MIN - 6 }}
                >
                  {h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {DAYS.map((_, colIdx) => (
              <div
                key={colIdx}
                className="relative flex-1 border-l border-white/[0.06]"
                style={{ height: totalHeight }}
              >
                {/* Hour grid lines */}
                {hourLabels.map((h) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-white/[0.05]"
                    style={{ top: (h * 60 - rangeStart) * PX_PER_MIN }}
                  />
                ))}

                {/* Meeting blocks */}
                {blocks
                  .filter((b) => b.col === colIdx)
                  .map((b, i) => {
                    const top = (b.startMin - rangeStart) * PX_PER_MIN;
                    const height = Math.max((b.endMin - b.startMin) * PX_PER_MIN, 20);
                    return (
                      <div
                        key={i}
                        className={`absolute inset-x-0.5 overflow-hidden rounded border ${b.color.border} ${b.color.bg} px-1 py-0.5`}
                        style={{ top, height }}
                      >
                        <p className={`truncate text-[10px] font-bold leading-tight ${b.color.text}`}>
                          {b.courseCode}
                        </p>
                        {height >= 28 && (
                          <p className="truncate text-[9px] leading-tight text-hub-text-muted">
                            {b.meeting.section_type}
                          </p>
                        )}
                        {height >= 40 && (
                          <p className="truncate text-[9px] leading-tight text-hub-text-muted">
                            {b.meeting.location}
                          </p>
                        )}
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
