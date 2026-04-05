import type { ClassDossier, SetSummary, StatusChipData, SunsetGradeDistribution } from "@/types/dossier";
import type { CourseEntry, CourseResearchResult } from "@/lib/api/parse";

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export function courseResearchResultToDossier(
  result: CourseResearchResult,
): ClassDossier {
  const log = result.logistics;

  // Build logistics chips from booleans; fall back to meeting chips
  let chips: StatusChipData[];
  if (log) {
    chips = [];
    if (log.attendance_required != null) {
      chips.push({
        id: `${result.course_code}-attendance`,
        label: log.attendance_required ? "Attendance required" : "Attendance optional",
        tone: log.attendance_required ? "muted" : "green",
      });
    }
    if (log.podcasts_available != null && log.podcasts_available) {
      chips.push({
        id: `${result.course_code}-podcasts`,
        label: "Podcasts available",
        tone: "purple",
      });
    }
    if (log.textbook_required != null) {
      chips.push({
        id: `${result.course_code}-textbook`,
        label: log.textbook_required ? "Textbook required" : "No textbook",
        tone: log.textbook_required ? "muted" : "green",
      });
    }
    // fall back to meeting chips if no logistics chips were generated
    if (chips.length === 0) {
      chips = result.meetings.map((m, i) => ({
        id: `${result.course_code}-${i}`,
        label: `${m.section_type}: ${m.days} ${m.start_time}–${m.end_time}${m.location ? ` · ${m.location}` : ""}`,
        tone: i === 0 ? "cyan" : "muted",
      }));
    }
  } else {
    chips = result.meetings.map((m, i) => ({
      id: `${result.course_code}-${i}`,
      label: `${m.section_type}: ${m.days} ${m.start_time}–${m.end_time}${m.location ? ` · ${m.location}` : ""}`,
      tone: i === 0 ? "cyan" : "muted",
    }));
  }

  // Confidence: count non-null logistics fields out of 7
  let confidencePercent = 0;
  if (log) {
    const fields = [
      log.attendance_required,
      log.grade_breakdown,
      log.course_webpage_url,
      log.textbook_required,
      log.podcasts_available,
      log.student_sentiment_summary,
      log.rate_my_professor?.rating,
    ];
    const nonNull = fields.filter((f) => f != null).length;
    confidencePercent = Math.min(100, Math.round((nonNull / 7) * 100));
  }

  const professorName = result.professor_name || "TBA";

  const condensedSummary = log?.grade_breakdown ? [log.grade_breakdown] : [];

  return {
    id: result.course_code.toLowerCase().replace(/\s+/g, "-"),
    courseCode: result.course_code,
    courseTitle: result.course_title ?? result.course_code,
    professorName,
    professorInitials: result.professor_name ? getInitials(result.professor_name) : "?",
    condensedSummary,
    tldr: log?.student_sentiment_summary ?? "",
    confidencePercent,
    chips,
    rawQuotes: [],
    meetings: result.meetings,
    logistics: log ?? undefined,
    sunsetGradeDistribution: result.sunset_grade_distribution ?? undefined,
  };
}

export function getSunsetSummary(
  sunset: SunsetGradeDistribution | null | undefined,
): SetSummary | null {
  if (!sunset) return null;
  if (sunset.set_summary) return sunset.set_summary;

  const payload = sunset.grade_distribution ?? {};
  const distribution =
    payload.distribution && typeof payload.distribution === "object"
      ? (payload.distribution as Record<string, number>)
      : {};
  const averageGpa =
    typeof payload.average_gpa === "number" ? payload.average_gpa : null;
  const totalStudents =
    typeof payload.total_students === "number" ? payload.total_students : null;

  if (Object.keys(distribution).length === 0 && averageGpa == null && totalStudents == null) {
    return null;
  }

  return {
    average_gpa: averageGpa,
    sample_size: totalStudents,
    grade_counts: distribution,
  };
}

export function courseEntryToDossier(entry: CourseEntry): ClassDossier {
  return {
    id: entry.course_code.toLowerCase().replace(/\s+/g, "-"),
    courseCode: entry.course_code,
    courseTitle: entry.course_title,
    professorName: entry.professor_name || "TBA",
    professorInitials: entry.professor_name
      ? getInitials(entry.professor_name)
      : "?",
    condensedSummary: [],
    tldr: "",
    confidencePercent: 0,
    chips: entry.meetings.map((m, i) => ({
      id: `${entry.course_code}-${i}`,
      label: `${m.section_type}: ${m.days} ${m.start_time}–${m.end_time}${m.location ? ` · ${m.location}` : ""}`,
      tone: i === 0 ? "cyan" : "muted",
    })),
    rawQuotes: [],
    meetings: entry.meetings,
  };
}
