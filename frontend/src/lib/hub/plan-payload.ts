import { mockDossier } from "@/lib/mock/dossier";
import type {
  ClassDossier,
  ScheduleEvaluation,
  ScheduleCommitment,
} from "@/types/dossier";

// ---------------------------------------------------------------------------
// V1 payload — full dossiers embedded in saved_plans.payload
// ---------------------------------------------------------------------------
export type SavedPlanPayloadV1 = {
  version?: 1;
  activeQuarterId?: string;
  classes?: ClassDossier[];
  commitments?: ScheduleCommitment[];
  evaluation?: ScheduleEvaluation;
};

// ---------------------------------------------------------------------------
// V2 payload — class references; full dossiers live in course_research_cache
// ---------------------------------------------------------------------------
export type ClassRef = {
  /** UUID from course_research_cache */
  course_cache_id: string;
  course_code: string;
  professor_name?: string | null;
  /** Geocoded SectionMeeting[] from the research response */
  meetings: unknown[];
  /** User edits (e.g. renamed title) */
  overrides?: Record<string, unknown>;
};

export type SavedPlanPayloadV2 = {
  version: 2;
  activeQuarterId?: string;
  commitments?: ScheduleCommitment[];
  evaluation?: ScheduleEvaluation;
  /** Inline class refs (mirrors saved_plan_classes join rows) */
  class_refs: ClassRef[];
};

export type SavedPlanPayload = SavedPlanPayloadV1 | SavedPlanPayloadV2;

// ---------------------------------------------------------------------------
// Parse — handles v1 and v2
// ---------------------------------------------------------------------------
export function parsePlanPayload(raw: unknown): {
  classes: ClassDossier[];
  commitments: ScheduleCommitment[];
  evaluation: ScheduleEvaluation;
  activeQuarterId: string;
  version: 1 | 2;
  classRefs: ClassRef[];
} {
  const empty = {
    classes: [] as ClassDossier[],
    commitments: [] as ScheduleCommitment[],
    evaluation: mockDossier.evaluation,
    activeQuarterId: "",
    version: 1 as 1 | 2,
    classRefs: [] as ClassRef[],
  };

  if (!raw || typeof raw !== "object") return empty;

  const o = raw as Record<string, unknown>;
  const version = o.version === 2 ? 2 : 1;

  const commitments = Array.isArray(o.commitments)
    ? (o.commitments as ScheduleCommitment[])
    : [];
  const evaluation = (o.evaluation as ScheduleEvaluation | undefined) ?? mockDossier.evaluation;
  const activeQuarterId =
    typeof o.activeQuarterId === "string" ? o.activeQuarterId : "";

  if (version === 2) {
    const classRefs = Array.isArray(o.class_refs)
      ? (o.class_refs as ClassRef[])
      : [];
    return {
      classes: [], // v2 plans load classes via /plans/{id}/expanded
      commitments,
      evaluation,
      activeQuarterId,
      version: 2,
      classRefs,
    };
  }

  // v1 — full dossiers
  const classes = Array.isArray(o.classes) ? (o.classes as ClassDossier[]) : [];
  return { classes, commitments, evaluation, activeQuarterId, version: 1, classRefs: [] };
}

// ---------------------------------------------------------------------------
// Build helpers
// ---------------------------------------------------------------------------
export function buildPayloadFromMock(activeQuarterId: string): SavedPlanPayloadV1 {
  return {
    version: 1,
    activeQuarterId,
    classes: mockDossier.classes,
    commitments: [],
    evaluation: mockDossier.evaluation,
  };
}

/** Build a v1 payload (full dossiers). Used when no cache_ids are available. */
export function buildPayloadFromClasses(
  activeQuarterId: string,
  classes: ClassDossier[],
  commitments: ScheduleCommitment[] = [],
  evaluation: ScheduleEvaluation = mockDossier.evaluation,
): SavedPlanPayloadV1 {
  return { version: 1, activeQuarterId, classes, commitments, evaluation };
}

/** Build a v2 payload (references only). Requires cacheId on the dossiers. */
export function buildPayloadV2(
  activeQuarterId: string,
  classes: ClassDossier[],
  commitments: ScheduleCommitment[] = [],
  evaluation: ScheduleEvaluation = mockDossier.evaluation,
): SavedPlanPayloadV2 {
  const class_refs: ClassRef[] = classes
    .filter((c) => !!c.cacheId)
    .map((c) => ({
      course_cache_id: c.cacheId!,
      course_code: c.courseCode,
      professor_name: c.professorName ?? null,
      meetings: c.meetings as unknown[],
      overrides: {},
    }));

  return { version: 2, activeQuarterId, class_refs, commitments, evaluation };
}

/** Returns true if every class has a cacheId — safe to save as v2. */
export function canSaveAsV2(classes: ClassDossier[]): boolean {
  return classes.length > 0 && classes.every((c) => !!c.cacheId);
}
