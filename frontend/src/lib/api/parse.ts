import { createClient } from "@/lib/supabase/client";
import type { CourseLogistics, FitnessCategory, ScheduleBriefing } from "@/types/dossier";

export interface SectionMeeting {
  section_type: string;
  days: string;
  start_time: string;
  end_time: string;
  location: string;
  building_code?: string;
  lat?: number;
  lng?: number;
  geocode_status?: "resolved" | "ambiguous" | "unresolved" | "remote";
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
  is_cross_course_fallback?: boolean;
  source_course_code?: string | null;
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
  /** UUID of the course_research_cache row — used to save v2 plan references. */
  cache_id: string | null;
}

export interface BatchResearchResponse {
  course_count: number;
  results: CourseResearchResult[];
  /** Present on known-schedule fast-path hits where fit analysis was previously cached. */
  fit_evaluation?: FitAnalysisResult | null;
}

export interface UserInputFeedback {
  academic_alignment: string[];
  practical_risks: string[];
}

export interface FitAnalysisResult {
  fitness_score: number;
  fitness_max: number;
  trend_label: string;
  study_hours_min?: number;
  study_hours_max?: number;
  categories?: FitnessCategory[];
  alerts: Array<{ id: string; severity: "critical" | "warning" | "info"; title: string; detail: string }>;
  /** New API returns string[]; old saved plans may have a legacy string. */
  recommendation: string[] | string;
  user_input_feedback?: UserInputFeedback | string[] | null;
}

export async function analyzeFit(
  results: CourseResearchResult[],
  context?: ScheduleBriefing,
): Promise<FitAnalysisResult> {
  const res = await fetch("http://localhost:8000/api/fit-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ results, user_context: context ?? null }),
  });
  if (!res.ok) throw new Error(`Fit analysis failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<FitAnalysisResult>;
}

export class InvalidScheduleError extends Error {
  readonly code = "INVALID_SCHEDULE";
  constructor(message: string) {
    super(message);
    this.name = "InvalidScheduleError";
  }
}

export class RateLimitedError extends Error {
  readonly code = "RATE_LIMITED";
  readonly retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "RateLimitedError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function _getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
  } catch { /* unauthenticated — fall through */ }
  return {};
}

export async function researchScreenshot(
  file: File,
  { forceRefresh = false }: { forceRefresh?: boolean } = {},
): Promise<BatchResearchResponse> {
  const form = new FormData();
  form.append("file", file);

  const url = forceRefresh
    ? "http://localhost:8000/api/research-screenshot?force_refresh=true"
    : "http://localhost:8000/api/research-screenshot";

  const authHeaders = await _getAuthHeaders();

  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders,
    body: form,
  });

  if (!res.ok) {
    let detail: { code?: string; message?: string; retry_after_seconds?: number } = {};
    try {
      const body = await res.json() as { detail?: typeof detail };
      if (typeof body.detail === "object" && body.detail !== null) detail = body.detail;
    } catch { /* ignore */ }

    if (res.status === 422 && detail.code === "INVALID_SCHEDULE") {
      throw new InvalidScheduleError(detail.message ?? "Invalid schedule image.");
    }
    if (res.status === 429 && detail.code === "RATE_LIMITED") {
      throw new RateLimitedError(
        detail.message ?? "Too many invalid uploads. Please wait before trying again.",
        detail.retry_after_seconds ?? 600,
      );
    }
    throw new Error(`Research failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<BatchResearchResponse>;
}
