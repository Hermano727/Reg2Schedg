"use client";

import { useState, type ReactNode } from "react";
import type { ClassDossier, ScheduleCommitment, SectionMeeting } from "@/types/dossier";

const DEFAULT_PX_PER_HOUR = 64;

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

export function parseTimeToMinutes(t: string): number {
  const [timePart, period] = t.trim().split(" ");
  const [hStr, mStr] = timePart.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return h * 60 + m;
}

export function parseDaysToCols(days: string): number[] {
  const cols: number[] = [];
  let i = 0;
  while (i < days.length) {
    if (days.startsWith("Tu", i)) {
      cols.push(1);
      i += 2;
    } else if (days.startsWith("Th", i)) {
      cols.push(3);
      i += 2;
    } else if (days.startsWith("Sa", i)) {
      cols.push(5);
      i += 2;
    } else if (days[i] === "M") {
      cols.push(0);
      i++;
    } else if (days[i] === "W") {
      cols.push(2);
      i++;
    } else if (days[i] === "F") {
      cols.push(4);
      i++;
    } else i++;
  }
  return cols;
}

export const COL_TO_DAY: Record<number, string> = {
  0: "M",
  1: "Tu",
  2: "W",
  3: "Th",
  4: "F",
};

export function minutesToTimeStr(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function minutesToTimeInput(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function removeDayFromString(days: string, colToRemove: number): string {
  const remaining = parseDaysToCols(days).filter((c) => c !== colToRemove);
  return remaining.map((c) => COL_TO_DAY[c]).join("");
}

export interface CourseBlock {
  kind: "course";
  meeting: SectionMeeting;
  color: (typeof PALETTE)[number];
  courseCode: string;
  col: number;
  startMin: number;
  endMin: number;
  dossierId: string;
  meetingIdx: number;
  blockKey: string;
}

export interface CommitmentBlock {
  kind: "commitment";
  commitment: ScheduleCommitment;
  blockKey: string;
}

type GridBlock = CourseBlock | CommitmentBlock;

export interface WeeklyCalendarProps {
  classes: ClassDossier[];
  commitments: ScheduleCommitment[];
  onApply: (next: { classes: ClassDossier[]; commitments: ScheduleCommitment[] }) => void;
  pxPerHour?: number;
  className?: string;
  /** Shown on the right side of the “Weekly schedule” title (sync, expand, etc.) */
  headerActions?: ReactNode;
  /** Hide the title row (e.g. when the parent already shows a schedule heading). */
  hideScheduleHeading?: boolean;
  /** Called when a block is double-clicked — use to open an edit modal. */
  onBlockDoubleClick?: (block: CourseBlock | CommitmentBlock) => void;
}

export function WeeklyCalendar({
  classes,
  commitments,
  onApply,
  pxPerHour = DEFAULT_PX_PER_HOUR,
  className = "",
  headerActions,
  hideScheduleHeading = false,
  onBlockDoubleClick,
}: WeeklyCalendarProps) {
  const pxPerMin = pxPerHour / 60;
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<{
    col: number;
    top: number;
    height: number;
  } | null>(null);

  const blocks: GridBlock[] = [];
  let allStart = Infinity;
  let allEnd = -Infinity;

  classes.forEach((dossier, idx) => {
    const color = PALETTE[idx % PALETTE.length];
    dossier.meetings.forEach((meeting, meetingIdx) => {
      const startMin = parseTimeToMinutes(meeting.start_time);
      const endMin = parseTimeToMinutes(meeting.end_time);
      if (startMin < allStart) allStart = startMin;
      if (endMin > allEnd) allEnd = endMin;
      parseDaysToCols(meeting.days).forEach((col) => {
        if (col > 4) return;
        blocks.push({
          kind: "course",
          meeting,
          color,
          courseCode: dossier.courseCode,
          col,
          startMin,
          endMin,
          dossierId: dossier.id,
          meetingIdx,
          blockKey: `course:${dossier.id}:${meetingIdx}:${col}`,
        });
      });
    });
  });

  commitments.forEach((c) => {
    if (c.dayCol < 0 || c.dayCol > 4) return;
    if (c.startMin < allStart) allStart = c.startMin;
    if (c.endMin > allEnd) allEnd = c.endMin;
    blocks.push({
      kind: "commitment",
      commitment: c,
      blockKey: `commit:${c.id}`,
    });
  });

  if (blocks.length === 0) return null;

  const rangeStart = Math.max(8 * 60, Math.floor((allStart - 30) / 60) * 60);
  const rangeEnd = Math.min(22 * 60, Math.ceil((allEnd + 30) / 60) * 60);
  const totalHours = (rangeEnd - rangeStart) / 60;
  const totalHeight = totalHours * pxPerHour;

  const hourLabels: number[] = [];
  for (let h = rangeStart / 60; h <= rangeEnd / 60; h++) hourLabels.push(h);

  function handleDragStart(e: React.DragEvent, blockKey: string) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", blockKey);
    setDragKey(blockKey);
  }

  function handleDragEnd() {
    setDragKey(null);
    setDropPreview(null);
  }

  function handleDragOver(e: React.DragEvent, colIdx: number) {
    e.preventDefault();
    if (!dragKey) return;
    const block = blocks.find((b) => b.blockKey === dragKey);
    if (!block) return;
    const startMin =
      block.kind === "course" ? block.startMin : block.commitment.startMin;
    const endMin = block.kind === "course" ? block.endMin : block.commitment.endMin;
    const duration = endMin - startMin;
    const rect = e.currentTarget.getBoundingClientRect();
    const snappedMin =
      Math.round((e.clientY - rect.top) / pxPerMin / 15) * 15;
    const newStartMin = Math.max(
      rangeStart,
      Math.min(rangeEnd - duration, rangeStart + snappedMin),
    );
    setDropPreview({
      col: colIdx,
      top: (newStartMin - rangeStart) * pxPerMin,
      height: duration * pxPerMin,
    });
  }

  function handleDragLeave() {
    setDropPreview(null);
  }

  function handleDrop(e: React.DragEvent, colIdx: number) {
    e.preventDefault();
    const blockKey = e.dataTransfer.getData("text/plain");
    const block = blocks.find((b) => b.blockKey === blockKey);
    if (!block) {
      setDropPreview(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const snappedMin =
      Math.round((e.clientY - rect.top) / pxPerMin / 15) * 15;

    if (block.kind === "commitment") {
      const { commitment } = block;
      const duration = commitment.endMin - commitment.startMin;
      const newStartMin = Math.max(
        rangeStart,
        Math.min(rangeEnd - duration, rangeStart + snappedMin),
      );
      const newEndMin = newStartMin + duration;
      if (newStartMin === commitment.startMin && colIdx === commitment.dayCol) {
        setDropPreview(null);
        return;
      }
      const nextCommitments = commitments.map((c) =>
        c.id === commitment.id
          ? { ...c, dayCol: colIdx, startMin: newStartMin, endMin: newEndMin }
          : c,
      );
      onApply({ classes, commitments: nextCommitments });
      setDropPreview(null);
      setDragKey(null);
      return;
    }

    const duration = block.endMin - block.startMin;
    const newStartMin = Math.max(
      rangeStart,
      Math.min(rangeEnd - duration, rangeStart + snappedMin),
    );
    const newEndMin = newStartMin + duration;

    if (newStartMin === block.startMin && colIdx === block.col) {
      setDropPreview(null);
      return;
    }

    const newDayToken = COL_TO_DAY[colIdx];
    const updatedClasses = classes.map((d) => {
      if (d.id !== block.dossierId) return d;
      const meetings = [...d.meetings];
      const orig = meetings[block.meetingIdx];
      const origCols = parseDaysToCols(orig.days);

      const updatedMeeting: SectionMeeting = {
        ...orig,
        days: newDayToken,
        start_time: minutesToTimeStr(newStartMin),
        end_time: minutesToTimeStr(newEndMin),
      };

      if (origCols.length === 1) {
        meetings[block.meetingIdx] = updatedMeeting;
      } else {
        meetings[block.meetingIdx] = {
          ...orig,
          days: removeDayFromString(orig.days, block.col),
        };
        meetings.push(updatedMeeting);
      }
      return { ...d, meetings };
    });

    onApply({ classes: updatedClasses, commitments });
    setDropPreview(null);
    setDragKey(null);
  }

  function blockPosition(b: GridBlock): { top: number; height: number; col: number } {
    if (b.kind === "course") {
      return {
        top: (b.startMin - rangeStart) * pxPerMin,
        height: Math.max((b.endMin - b.startMin) * pxPerMin, 20),
        col: b.col,
      };
    }
    const c = b.commitment;
    return {
      top: (c.startMin - rangeStart) * pxPerMin,
      height: Math.max((c.endMin - c.startMin) * pxPerMin, 20),
      col: c.dayCol,
    };
  }

  return (
    <div
      className={`rounded-xl border border-white/[0.08] bg-hub-surface/90 p-4 backdrop-blur-sm ${className}`}
    >
      {!hideScheduleHeading || headerActions ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
          {!hideScheduleHeading ? (
            <h2 className="text-xs font-semibold uppercase tracking-widest text-hub-text-muted">
              Weekly schedule
            </h2>
          ) : (
            <span className="sr-only">Weekly schedule grid</span>
          )}
          {headerActions ? (
            <div className="flex flex-wrap items-center justify-end gap-2">{headerActions}</div>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <div className="w-full min-w-0">
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

          <div className="flex">
            <div className="relative w-10 shrink-0" style={{ height: totalHeight }}>
              {hourLabels.map((h) => (
                <div
                  key={h}
                  className="absolute right-2 text-[10px] leading-none text-hub-text-muted"
                  style={{ top: (h * 60 - rangeStart) * pxPerMin - 6 }}
                >
                  {h === 0
                    ? "12a"
                    : h < 12
                      ? `${h}a`
                      : h === 12
                        ? "12p"
                        : `${h - 12}p`}
                </div>
              ))}
            </div>

            {DAYS.map((_, colIdx) => (
              <div
                key={colIdx}
                className="relative flex-1 border-l border-white/[0.06]"
                style={{ height: totalHeight }}
                onDragOver={(e) => handleDragOver(e, colIdx)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, colIdx)}
              >
                {hourLabels.map((h) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-white/[0.05]"
                    style={{ top: (h * 60 - rangeStart) * pxPerMin }}
                  />
                ))}

                {dropPreview?.col === colIdx && (
                  <div
                    className="pointer-events-none absolute inset-x-0.5 rounded border border-white/30 bg-white/10"
                    style={{ top: dropPreview.top, height: dropPreview.height }}
                  />
                )}

                {blocks
                  .filter((b) => blockPosition(b).col === colIdx)
                  .map((b) => {
                    const { top, height } = blockPosition(b);
                    if (b.kind === "course") {
                      return (
                        <div
                          key={b.blockKey}
                          draggable
                          onDragStart={(e) => handleDragStart(e, b.blockKey)}
                          onDragEnd={handleDragEnd}
                          onDoubleClick={(e) => { e.stopPropagation(); onBlockDoubleClick?.(b); }}
                          className={`absolute inset-x-0.5 overflow-hidden rounded border ${b.color.border} ${b.color.bg} px-1 py-0.5
                          ${dragKey === b.blockKey ? "cursor-grabbing opacity-40" : "cursor-grab"}`}
                          style={{ top, height }}
                        >
                          <p
                            className={`truncate text-[10px] font-bold leading-tight ${b.color.text}`}
                          >
                            {b.courseCode}: {minutesToTimeStr(b.startMin)}–{minutesToTimeStr(b.endMin)}
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
                    }
                    const hex = b.commitment.color;
                    return (
                      <div
                        key={b.blockKey}
                        draggable
                        onDragStart={(e) => handleDragStart(e, b.blockKey)}
                        onDragEnd={handleDragEnd}
                        onDoubleClick={(e) => { e.stopPropagation(); onBlockDoubleClick?.(b); }}
                        className={`absolute inset-x-0.5 overflow-hidden rounded border px-1 py-0.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]
                          ${dragKey === b.blockKey ? "cursor-grabbing opacity-40" : "cursor-grab"}`}
                        style={{
                          top,
                          height,
                          borderColor: `${hex}aa`,
                          backgroundColor: `${hex}22`,
                        }}
                      >
                        <p
                          className="truncate text-[10px] font-bold leading-tight"
                          style={{ color: hex }}
                        >
                          {b.commitment.title}
                        </p>
                        {height >= 30 && (
                          <p className="truncate text-[9px] leading-tight text-hub-text-muted">
                            {minutesToTimeStr(b.commitment.startMin)}–{minutesToTimeStr(b.commitment.endMin)}
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
