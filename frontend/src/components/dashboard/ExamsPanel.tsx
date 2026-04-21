"use client";

import { GraduationCap } from "lucide-react";
import { isExamSection } from "@/lib/mappers/dossiersToScheduleItems";
import type { ClassDossier } from "@/types/dossier";

type ExamEntry = {
  sectionType: string;
  days: string;
  start_time: string;
  end_time: string;
  location: string;
};

function examLabel(sectionType: string): string {
  if (sectionType === "FI") return "Final exam";
  if (sectionType === "MI") return "Midterm";
  return sectionType;
}

export function ExamsPanel({ classes }: { classes: ClassDossier[] }) {
  // Group exam sections by course code
  const grouped = new Map<string, ExamEntry[]>();
  for (const c of classes) {
    if (!c.courseCode) continue;
    for (const m of c.meetings) {
      if (!isExamSection(m.section_type)) continue;
      const existing = grouped.get(c.courseCode) ?? [];
      existing.push({
        sectionType: m.section_type.toUpperCase(),
        days: m.days,
        start_time: m.start_time,
        end_time: m.end_time,
        location: m.location,
      });
      grouped.set(c.courseCode, existing);
    }
  }

  if (grouped.size === 0) return null;

  return (
    <section
      className="rounded-xl border border-white/[0.13] px-6 py-5"
      style={{
        background: "rgba(17, 34, 64, 0.92)",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.05) inset, 0 4px 16px rgba(0,0,0,0.35)",
      }}
    >
      <div className="mb-5 flex items-center gap-2.5">
        <GraduationCap className="h-4 w-4 text-hub-gold" aria-hidden />
        <h2 className="text-sm font-semibold text-white/90">
          Upcoming exams
        </h2>
        <h3 className="ml-auto text-xs font-medium text-white/50">
          Note: These frequently change, so double-check with your course materials!
        </h3>
      </div>

      <div className="space-y-6">
        {Array.from(grouped.entries()).map(([courseCode, exams]) => (
          <div key={courseCode}>
            {/* Course label */}
            <p className="mb-3 font-[family-name:var(--font-jetbrains-mono)] text-xs font-semibold uppercase tracking-widest text-hub-cyan/70">
              {courseCode}
            </p>

            {/* Timeline */}
            <div className="relative pl-5">
              {/* Vertical track */}
              <div className="absolute left-[5px] top-1 bottom-1 w-px bg-white/[0.08]" />

              <div className="space-y-5">
                {exams.map((ex, i) => (
                  <div key={i} className="relative">
                    {/* Timeline dot */}
                    <div className="absolute -left-5 top-[6px] h-2.5 w-2.5 rounded-full border-2 border-hub-gold bg-hub-bg" />

                    {/* Exam type */}
                    <p className="text-sm font-semibold text-white/90">
                      {examLabel(ex.sectionType)}
                    </p>

                    {/* Time */}
                    <p className="mt-1 font-[family-name:var(--font-jetbrains-mono)] text-sm tabular-nums text-white/70">
                      {ex.days} &nbsp;{ex.start_time}&ndash;{ex.end_time}
                    </p>

                    {/* Location */}
                    {ex.location && (
                      <p className="mt-0.5 text-sm text-white/50">{ex.location}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
