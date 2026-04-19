export type UiPhase = "idle" | "processing" | "dashboard";

export type TransitProfile = "walking" | "biking" | "spin" | "car";
export type PriorityType = "career" | "research" | "interest" | "grad_school";
export type SkillFocus = "project" | "theoretical" | "career" | "mixed";

export type ScheduleBriefing = {
  scheduleTitle: string;
  priority: PriorityType;
  balancedDifficulty: boolean;
  skillFocus: SkillFocus;
  transitProfile: TransitProfile;
  careerGoals?: string;
  currentWorries?: string;
  externalCommitments?: string;
};

export type AlertSeverity = "critical" | "warning" | "info";

export interface QuarterRef {
  id: string;
  label: string;
  isActive?: boolean;
}

export interface VaultItem {
  id: string;
  name: string;
  kind: "syllabus" | "webreg" | "note" | "pdf" | "image" | "doc" | "community";
  mimeType?: string | null;
  sizeBytes?: number | null;
  updatedAt: string;
  signedUrl?: string;
  // Community attachment saves
  communityPostId?: string | null;
  communityReplyId?: string | null;
  communityPostTitle?: string | null;
  communityReplyPreview?: string | null;
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
  geocode_status?: "resolved" | "ambiguous" | "unresolved" | "remote";
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

export interface EvidenceItem {
  source: string;
  content: string;
  url?: string | null;
  relevance_score: number;
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
  is_cross_course_fallback?: boolean;
  source_course_code?: string | null;
}

export interface GradeRow {
  component: string;
  weight: string;
}

export interface GradeScheme {
  label: string | null;
  rows: GradeRow[];
}

export interface CourseLogistics {
  attendance_required: boolean | null;
  grade_breakdown: string | null;
  grade_schemes?: GradeScheme[] | null;
  course_webpage_url: string | null;
  textbook_required: boolean | null;
  podcasts_available: boolean | null;
  student_sentiment_summary: string | null;
  rate_my_professor: RateMyProfessorStats;
  evidence?: EvidenceItem[];
  professor_info_found?: boolean;
  general_course_overview?: string | null;
  general_professor_overview?: string | null;
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
  /** UUID of the canonical course_research_cache row. Present after research; used to build v2 saved-plan references. */
  cacheId?: string | null;
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

export interface UserInputFeedback {
  academic_alignment: string[];
  practical_risks: string[];
}

export interface ScheduleEvaluation {
  fitnessScore: number;
  fitnessMax: number;
  trendLabel: string;
  categories?: FitnessCategory[];
  alerts: ScheduleAlert[];
  /** New API returns string[]; old saved plans may have a legacy string. */
  recommendation?: string[] | string;
  /** Estimated weekly study hours (outside class). */
  studyHoursMin?: number;
  studyHoursMax?: number;
  /** Gemini's structured response to student's stated goals vs. courses. Only present when briefing was provided. */
  userInputFeedback?: UserInputFeedback | string[] | string;
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
  buildingDisplayName?: string;
  lat?: number;
  lng?: number;
  geocode_status?: "resolved" | "ambiguous" | "unresolved" | "remote";
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

/**
 * Subset of ClassDossier fields that users can manually correct.
 * Applied client-side only; persisted when the user saves their plan.
 * Designed to be extended when document-upload (syllabus parsing) is added.
 */
export interface DossierEditPatch {
  courseTitle?: string;
  professorName?: string;
  /** Partial override of CourseLogistics — only the correctable fields. */
  logistics?: {
    grade_breakdown?: string | null;
    attendance_required?: boolean | null;
    textbook_required?: boolean | null;
    podcasts_available?: boolean | null;
  };
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
