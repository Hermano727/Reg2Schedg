"use client";

import { GraduationCap } from "lucide-react";
import { isExamSection } from "@/lib/mappers/dossiersToScheduleItems";
import type { ClassDossier } from "@/types/dossier";

type ExamEntry = {
  courseCode: string;
  sectionType: string;
  days: string;
  start_time: string;
  end_time: string;
  location: string;
};

export function ExamsPanel({ classes }: { classes: ClassDossier[] }) {
  const exams: ExamEntry[] = [];
  for (const c of classes) {
    for (const m of c.meetings) {
      if (!isExamSection(m.section_type)) continue;
      exams.push({
        courseCode: c.courseCode,
        sectionType: m.section_type.toUpperCase(),
        days: m.days,
        start_time: m.start_time,
        end_time: m.end_time,
        location: m.location,
      });
    }
  }
  if (exams.length === 0) return null;

  return (
    <section className="rounded-xl border border-white/[0.08] bg-hub-surface/90 px-4 py-3 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <GraduationCap className="h-4 w-4 text-hub-gold" aria-hidden />
        <h2 className="text-xs font-semibold text-hub-text-muted">
          Exam logistics
        </h2>
      </div>
      <div className="divide-y divide-white/[0.05]">
        {exams.map((ex, i) => (
          <div
            key={i}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-xs text-hub-text-secondary"
          >
            <span className="font-semibold text-hub-text">{ex.courseCode}</span>
            <span className="rounded bg-hub-gold/10 px-1.5 py-0.5 text-[10px] font-bold text-hub-gold">
              {ex.sectionType === "FI" ? "Final" : ex.sectionType === "MI" ? "Midterm" : ex.sectionType}
            </span>
            <span>{ex.days} · {ex.start_time}–{ex.end_time}</span>
            {ex.location && <span className="text-hub-text-muted">{ex.location}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
