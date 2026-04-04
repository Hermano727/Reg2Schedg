import type { ClassDossier } from "@/types/dossier";
import type { CourseEntry } from "@/lib/api/parse";

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join("");
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
  };
}
