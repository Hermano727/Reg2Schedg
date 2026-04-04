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
}

export interface ScheduleAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
}

export interface ScheduleEvaluation {
  fitnessScore: number;
  fitnessMax: number;
  trendLabel: string;
  alerts: ScheduleAlert[];
}

export interface MockDossierPayload {
  activeQuarterId: string;
  quarters: QuarterRef[];
  vaultItems: VaultItem[];
  classes: ClassDossier[];
  evaluation: ScheduleEvaluation;
  terminalScript: string[];
}
