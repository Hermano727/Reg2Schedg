import type { CourseLogistics } from "@/types/dossier";

export interface SectionMeeting {
  section_type: string;
  days: string;
  start_time: string;
  end_time: string;
  location: string;
  building_code?: string;
  lat?: number;
  lng?: number;
  geocode_status?: "resolved" | "ambiguous" | "unresolved";
}

export interface CourseEntry {
  course_code: string;
  course_title: string;
  professor_name: string;
  meetings: SectionMeeting[];
}

export interface ParseScreenshotResponse {
  courses: CourseEntry[];
}

export interface SetSummary {
  average_gpa?: number | null;
  median_gpa?: number | null;
  pass_rate_percent?: number | null;
  sample_size?: number | null;
  grade_counts?: Record<string, number>;
}

export interface SunsetGradeDistribution {
  term_label?: string | null;
  professor_name?: string | null;
  grade_distribution: Record<string, unknown>;
  recommend_professor_percent?: number | null;
  submission_time?: string | null;
  source_url?: string | null;
  set_summary?: SetSummary | null;
}

export async function parseScreenshot(
  file: File,
): Promise<ParseScreenshotResponse> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch("http://localhost:8000/api/parse-screenshot", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Parse failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<ParseScreenshotResponse>;
}

export interface CourseResearchResult {
  course_code: string;
  course_title: string | null;
  professor_name: string | null;
  meetings: SectionMeeting[];
  logistics: CourseLogistics | null;
  sunset_grade_distribution: SunsetGradeDistribution | null;
  cache_hit: boolean;
  error: string | null;
}

export interface BatchResearchResponse {
  course_count: number;
  results: CourseResearchResult[];
}

export interface FitAnalysisResult {
  fitness_score: number;
  fitness_max: number;
  trend_label: string;
  alerts: Array<{ id: string; severity: "critical" | "warning" | "info"; title: string; detail: string }>;
  recommendation: string;
}

export async function analyzeFit(results: CourseResearchResult[]): Promise<FitAnalysisResult> {
  const res = await fetch("http://localhost:8000/api/fit-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ results }),
  });
  if (!res.ok) throw new Error(`Fit analysis failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<FitAnalysisResult>;
}

export async function researchScreenshot(
  file: File,
): Promise<BatchResearchResponse> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch("http://localhost:8000/api/research-screenshot", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Research failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<BatchResearchResponse>;
}
