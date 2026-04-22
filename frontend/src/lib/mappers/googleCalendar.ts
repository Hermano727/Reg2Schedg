import { isExamSection } from "@/lib/mappers/dossiersToScheduleItems";
import type { ClassDossier, ScheduleCommitment } from "@/types/dossier";

export type GoogleCalendarEvent = {
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  recurrence?: string[];
};

type BuildGoogleCalendarEventsInput = {
  classes: ClassDossier[];
  commitments: ScheduleCommitment[];
  courseLabels?: Record<string, string>;
  scheduleTitle?: string;
  timeZone?: string;
};

const RECURRENCE_COUNT = 10;

const ICAL_BYDAY_BY_COL: Record<number, string> = {
  0: "MO",
  1: "TU",
  2: "WE",
  3: "TH",
  4: "FR",
  5: "SA",
  6: "SU",
};

function formatLocalDateTime(date: Date, minutes: number): string {
  const next = new Date(date);
  next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);

  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, "0");
  const day = String(next.getDate()).padStart(2, "0");
  const hours = String(next.getHours()).padStart(2, "0");
  const mins = String(next.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${mins}:00`;
}

function parseDaysToCols(days: string): number[] {
  const cols: number[] = [];
  let index = 0;

  while (index < days.length) {
    if (days.startsWith("Tu", index)) {
      cols.push(1);
      index += 2;
    } else if (days.startsWith("Th", index)) {
      cols.push(3);
      index += 2;
    } else if (days.startsWith("Sa", index)) {
      cols.push(5);
      index += 2;
    } else if (days.startsWith("Su", index)) {
      cols.push(6);
      index += 2;
    } else if (days[index] === "M") {
      cols.push(0);
      index += 1;
    } else if (days[index] === "W") {
      cols.push(2);
      index += 1;
    } else if (days[index] === "F") {
      cols.push(4);
      index += 1;
    } else {
      index += 1;
    }
  }

  return cols;
}

function formatDaysLabel(cols: number[]): string {
  return cols
    .map((col) => {
      switch (col) {
        case 0:
          return "Mon";
        case 1:
          return "Tue";
        case 2:
          return "Wed";
        case 3:
          return "Thu";
        case 4:
          return "Fri";
        case 5:
          return "Sat";
        case 6:
          return "Sun";
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join(", ");
}

function parseTimeToMinutes(time: string): number {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) {
    throw new Error(`Unsupported time format: ${time}`);
  }

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();

  if (period === "AM" && hours === 12) hours = 0;
  if (period === "PM" && hours !== 12) hours += 12;

  return hours * 60 + minutes;
}

function getCurrentWeekOccurrence(dayCol: number): Date {
  const now = new Date();
  const currentDayCol = (now.getDay() + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - currentDayCol);

  const occurrence = new Date(weekStart);
  occurrence.setDate(weekStart.getDate() + dayCol);
  return occurrence;
}

function cleanLocation(location: string | undefined): string | undefined {
  const value = location?.trim();
  if (!value) return undefined;
  if (value.toLowerCase() === "tba") return undefined;
  return value;
}

function buildDescription(lines: Array<string | null | undefined>): string | undefined {
  const content = lines.map((line) => line?.trim()).filter((line): line is string => Boolean(line));
  return content.length > 0 ? content.join("\n") : undefined;
}

export function buildGoogleCalendarEvents({
  classes,
  commitments,
  courseLabels = {},
  scheduleTitle,
  timeZone = "America/Los_Angeles",
}: BuildGoogleCalendarEventsInput): GoogleCalendarEvent[] {
  const events: GoogleCalendarEvent[] = [];

  classes.forEach((dossier) => {
    dossier.meetings.forEach((meeting, meetingIdx) => {
      if (isExamSection(meeting.section_type)) return;

      const startMin = parseTimeToMinutes(meeting.start_time);
      const endMin = parseTimeToMinutes(meeting.end_time);
      const dayCols = parseDaysToCols(meeting.days);
      const byDays = dayCols.map((col) => ICAL_BYDAY_BY_COL[col]).filter(Boolean);
      if (byDays.length === 0) return;

      const labelKey = `${dossier.id}:${meetingIdx}`;
      const customLabel = courseLabels[labelKey]?.trim();
      const baseTitle =
        customLabel && customLabel !== dossier.courseCode
          ? `${customLabel} (${dossier.courseCode})`
          : dossier.courseCode;
      const firstDayCol = dayCols[0];
      const firstDate = getCurrentWeekOccurrence(firstDayCol);

      events.push({
        summary: `${baseTitle} ${meeting.section_type}`.trim(),
        location: cleanLocation(meeting.location),
        description: buildDescription([
          "Created by Reg2Schedg.",
          scheduleTitle ? `Schedule: ${scheduleTitle}` : null,
          `Professor: ${dossier.professorName}`,
          `Meets: ${formatDaysLabel(dayCols)} ${meeting.start_time} - ${meeting.end_time}`,
          meeting.location ? `Location: ${meeting.location}` : null,
        ]),
        start: {
          dateTime: formatLocalDateTime(firstDate, startMin),
          timeZone,
        },
        end: {
          dateTime: formatLocalDateTime(firstDate, endMin),
          timeZone,
        },
        recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${byDays.join(",")};COUNT=${RECURRENCE_COUNT}`],
      });
    });
  });

  commitments.forEach((commitment) => {
    const firstDate = getCurrentWeekOccurrence(commitment.dayCol);

    events.push({
      summary: commitment.title.trim() || "Custom commitment",
      description: buildDescription([
        "Created by Reg2Schedg.",
        scheduleTitle ? `Schedule: ${scheduleTitle}` : null,
        `Repeats every ${formatDaysLabel([commitment.dayCol])}.`,
      ]),
      start: {
        dateTime: formatLocalDateTime(firstDate, commitment.startMin),
        timeZone,
      },
      end: {
        dateTime: formatLocalDateTime(firstDate, commitment.endMin),
        timeZone,
      },
      recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${ICAL_BYDAY_BY_COL[commitment.dayCol]};COUNT=${RECURRENCE_COUNT}`],
    });
  });

  return events;
}
