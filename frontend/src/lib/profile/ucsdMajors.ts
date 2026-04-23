"use client";

import { createClient } from "@/lib/supabase/client";

const FALLBACK_DB_MAJORS = [
  "Aerospace Engineering",
  "Bioengineering",
  "Chemical Engineering",
  "Computer Engineering",
  "Computer Science",
  "Computer Science (Bioinformatics)",
  "Data Science",
  "Electrical Engineering",
  "Environmental Engineering",
  "Mechanical Engineering",
  "Nanoengineering",
  "Structural Engineering",
  "Biology",
  "Biochemistry",
  "Bioinformatics",
  "Biophysics",
  "Chemistry",
  "Cognitive Science",
  "Ecology, Behavior & Evolution",
  "Environmental Science",
  "Human Biology",
  "Mathematics",
  "Mathematics-Computer Science",
  "Microbiology",
  "Molecular Biology",
  "Neuroscience",
  "Pharmacological Chemistry",
  "Physics",
  "Physiology & Neuroscience",
  "Anthropology",
  "Communication",
  "Economics",
  "Education Sciences",
  "Ethnic Studies",
  "Global Health",
  "International Studies",
  "Linguistics",
  "Political Science",
  "Psychology",
  "Public Health",
  "Sociology",
  "Urban Studies and Planning",
  "African American Studies",
  "Critical Gender Studies",
  "History",
  "Jewish Studies",
  "Latin American Studies",
  "Literature",
  "Middle Eastern Studies",
  "Music",
  "Philosophy",
  "Theatre",
  "Visual Arts",
];

const MANUAL_MAJOR_OPTIONS = ["Undeclared", "Other"];

type MajorRow = {
  name: string;
};

function normalizeMajorOptions(names: string[]): string[] {
  return Array.from(
    new Set([
      ...names.map((name) => name.trim()).filter(Boolean),
      ...MANUAL_MAJOR_OPTIONS,
    ]),
  );
}

export const FALLBACK_UCSD_MAJORS = normalizeMajorOptions(FALLBACK_DB_MAJORS);

export async function fetchUcsdMajors(): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ucsd_majors")
    .select("name")
    .eq("is_active", true)
    .eq("catalog_year", "2025-26")
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return normalizeMajorOptions((data ?? []).map((row: MajorRow) => row.name));
}
