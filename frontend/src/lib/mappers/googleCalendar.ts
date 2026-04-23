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

export type GoogleCalendarBuildResult = {
  events: GoogleCalendarEvent[];
  includedExamCount: number;
  skippedExamCount: number;
};

type BuildGoogleCalendarEventsInput = {
  classes: ClassDossier[];
  commitments: ScheduleCommitment[];
  courseLabels?: Record<string, string>;
  scheduleTitle?: string;
  timeZone?: string;
  includeExamTimes?: boolean;
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
  const value = time.trim();

  const ampmMatch = value.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const period = ampmMatch[3].toUpperCase();

    if (period === "AM" && hours === 12) hours = 0;
    if (period === "PM" && hours !== 12) hours += 12;

    return hours * 60 + minutes;
  }

  const h24Match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (h24Match) {
    return parseInt(h24Match[1], 10) * 60 + parseInt(h24Match[2], 10);
  }

  const hourOnlyMatch = value.match(/^(\d{1,2})\s*(AM|PM)$/i);
  if (hourOnlyMatch) {
    let hours = parseInt(hourOnlyMatch[1], 10);
    const period = hourOnlyMatch[2].toUpperCase();

    if (period === "AM" && hours === 12) hours = 0;
    if (period === "PM" && hours !== 12) hours += 12;

    return hours * 60;
  }

  throw new Error(`Unsupported time format: ${time}`);
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

function buildUtcSafeDate(year: number, monthIndex: number, day: number): Date | null {
  const candidate = new Date(year, monthIndex, day);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== monthIndex ||
    candidate.getDate() !== day
  ) {
    return null;
  }
  candidate.setHours(0, 0, 0, 0);
  return candidate;
}

function normalizeTwoDigitYear(year: number): number {
  return year >= 100 ? year : 2000 + year;
}

function inferExamYear(monthIndex: number, day: number, referenceDate: Date): number | null {
  const currentYear = referenceDate.getFullYear();
  const currentYearCandidate = buildUtcSafeDate(currentYear, monthIndex, day);
  if (!currentYearCandidate) return null;

  const diffMs = currentYearCandidate.getTime() - referenceDate.getTime();
  const pastThresholdMs = 180 * 24 * 60 * 60 * 1000;

  if (diffMs < -pastThresholdMs) {
    return currentYear + 1;
  }

  return currentYear;
}

function parseExamDateFromDays(days: string, referenceDate = new Date()): Date | null {
  const value = days.trim();
  if (!value) return null;

  const isoMatch = value.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    return buildUtcSafeDate(
      parseInt(isoMatch[1], 10),
      parseInt(isoMatch[2], 10) - 1,
      parseInt(isoMatch[3], 10),
    );
  }

  const slashMatch = value.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slashMatch) {
    const monthIndex = parseInt(slashMatch[1], 10) - 1;
    const day = parseInt(slashMatch[2], 10);
    const parsedYear = slashMatch[3]
      ? normalizeTwoDigitYear(parseInt(slashMatch[3], 10))
      : inferExamYear(monthIndex, day, referenceDate);
    return parsedYear == null ? null : buildUtcSafeDate(parsedYear, monthIndex, day);
  }

  const monthNameMatch = value.match(
    /\b(Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\b\.?,?\s+(\d{1,2})(?:,?\s+(\d{2,4}))?/i,
  );
  if (monthNameMatch) {
    const monthToken = monthNameMatch[1].toLowerCase();
    const monthMap: Record<string, number> = {
      jan: 0,
      january: 0,
      feb: 1,
      february: 1,
      mar: 2,
      march: 2,
      apr: 3,
      april: 3,
      may: 4,
      jun: 5,
      june: 5,
      jul: 6,
      july: 6,
      aug: 7,
      august: 7,
      sep: 8,
      sept: 8,
      september: 8,
      oct: 9,
      october: 9,
      nov: 10,
      november: 10,
      dec: 11,
      december: 11,
    };
    const monthIndex = monthMap[monthToken];
    const day = parseInt(monthNameMatch[2], 10);
    const parsedYear = monthNameMatch[3]
      ? normalizeTwoDigitYear(parseInt(monthNameMatch[3], 10))
      : inferExamYear(monthIndex, day, referenceDate);
    return parsedYear == null ? null : buildUtcSafeDate(parsedYear, monthIndex, day);
  }

  return null;
}

function examSectionLabel(sectionType: string): string {
  const normalized = sectionType.trim().toUpperCase();
  if (normalized === "FI") return "Final Exam";
  if (normalized === "MI") return "Midterm";
  return normalized || "Exam";
}

export function buildGoogleCalendarEvents({
  classes,
  commitments,
  courseLabels = {},
  scheduleTitle,
  timeZone = "America/Los_Angeles",
  includeExamTimes = false,
}: BuildGoogleCalendarEventsInput): GoogleCalendarBuildResult {
  const events: GoogleCalendarEvent[] = [];
  let includedExamCount = 0;
  let skippedExamCount = 0;

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

  if (includeExamTimes) {
    classes.forEach((dossier) => {
      dossier.meetings.forEach((meeting) => {
        if (!isExamSection(meeting.section_type)) return;

        const examDate = parseExamDateFromDays(meeting.days);
        if (!examDate) {
          skippedExamCount += 1;
          return;
        }

        const startMin = parseTimeToMinutes(meeting.start_time);
        const endMin = parseTimeToMinutes(meeting.end_time);
        const examLabel = examSectionLabel(meeting.section_type);

        events.push({
          summary: `${dossier.courseCode} ${examLabel}`.trim(),
          location: cleanLocation(meeting.location),
          description: buildDescription([
            "Created by Reg2Schedg.",
            scheduleTitle ? `Schedule: ${scheduleTitle}` : null,
            `Professor: ${dossier.professorName}`,
            `Exam slot from WebReg: ${meeting.days} ${meeting.start_time} - ${meeting.end_time}`,
            "Warning: exam times often change due to department scheduling conflicts. Verify before the exam.",
            meeting.location ? `Location: ${meeting.location}` : null,
          ]),
          start: {
            dateTime: formatLocalDateTime(examDate, startMin),
            timeZone,
          },
          end: {
            dateTime: formatLocalDateTime(examDate, endMin),
            timeZone,
          },
        });
        includedExamCount += 1;
      });
    });
  }

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

  return {
    events,
    includedExamCount,
    skippedExamCount,
  };
}
