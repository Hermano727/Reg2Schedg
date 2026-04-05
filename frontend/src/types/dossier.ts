export type UiPhase = "idle" | "processing" | "dashboard";

export type AlertSeverity = "critical" | "warning" | "info";

export interface QuarterRef {
  id: string;
  label: string;
  isActive?: boolean;
}

export interface VaultItem {
  id: string;
  name: string;
  kind: "syllabus" | "webreg" | "note";
  updatedAt: string;
}

export interface StatusChipData {
  id: string;
  label: string;
  tone: "cyan" | "purple" | "green" | "muted";
}

export interface ClassConflict {
  title: string;
  detail: string;
}

export interface RawQuote {
  id: string;
  source: string;
  text: string;
}

export interface SectionMeeting {
  section_type: string; // "Lecture", "Discussion", "Lab"
  days: string;         // "MWF", "TuTh", "MW", etc.
  start_time: string;   // "10:00 AM"
  end_time: string;     // "10:50 AM"
  location: string;
  building_code?: string;
  lat?: number;
  lng?: number;
  geocode_status?: "resolved" | "ambiguous" | "unresolved";
}

/** User-defined block on the weekly grid (work, club, etc.) */
export interface ScheduleCommitment {
  id: string;
  title: string;
  /** CSS color (e.g. hex) for border/background tint */
  color: string;
  /** 0 = Mon … 4 = Fri */
  dayCol: number;
  startMin: number;
  endMin: number;
}

export interface RateMyProfessorStats {
  rating: number | null;
  would_take_again_percent: number | null;
  difficulty: number | null;
  url: string | null;
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

export interface CourseLogistics {
  attendance_required: boolean | null;
  grade_breakdown: string | null;
  course_webpage_url: string | null;
  textbook_required: boolean | null;
  podcasts_available: boolean | null;
  student_sentiment_summary: string | null;
  rate_my_professor: RateMyProfessorStats;
}

export interface ClassDossier {
  id: string;
  courseCode: string;
  courseTitle: string;
  professorName: string;
  professorInitials: string;
  condensedSummary: string[];
  tldr: string;
  confidencePercent: number;
  chips: StatusChipData[];
  rawQuotes: RawQuote[];
  conflict?: ClassConflict;
  meetings: SectionMeeting[];
  logistics?: CourseLogistics;
  sunsetGradeDistribution?: SunsetGradeDistribution | null;
}

export interface ScheduleAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
}

export interface FitnessCategory {
  label: string;
  score: number;
  max: number;
  color: string;
  detail: string;
}

export interface ScheduleEvaluation {
  fitnessScore: number;
  fitnessMax: number;
  trendLabel: string;
  categories?: FitnessCategory[];
  alerts: ScheduleAlert[];
  recommendation?: string;
}

export interface ScheduleItem {
  id: string;
  title: string;
  kind: "class" | "work" | "personal";
  day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
  start: string;
  end: string;
  location?: string;
  zone?: string;
  buildingCode?: string;
  lat?: number;
  lng?: number;
}

export interface TransitionInsight {
  id: string;
  fromId: string;
  toId: string;
  walkMinutes: number;
  gapMinutes: number;
  risk: "safe" | "tight" | "impossible";
  detail: string;
}

export interface MockDossierPayload {
  activeQuarterId: string;
  quarters: QuarterRef[];
  vaultItems: VaultItem[];
  classes: ClassDossier[];
  evaluation: ScheduleEvaluation;
  terminalScript: string[];
  scheduleItems: ScheduleItem[];
  transitionInsights: TransitionInsight[];
}
