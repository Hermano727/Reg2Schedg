import { mockDossier } from "@/lib/mock/dossier";
import type {
  ClassDossier,
  ScheduleEvaluation,
  ScheduleCommitment,
} from "@/types/dossier";

export type SavedPlanPayloadV1 = {
  activeQuarterId?: string;
  classes?: ClassDossier[];
  commitments?: ScheduleCommitment[];
  evaluation?: ScheduleEvaluation;
};

export function parsePlanPayload(raw: unknown): {
  classes: ClassDossier[];
  commitments: ScheduleCommitment[];
  evaluation: ScheduleEvaluation;
  activeQuarterId: string;
} {
  if (!raw || typeof raw !== "object") {
    return {
      classes: [],
      commitments: [],
      evaluation: mockDossier.evaluation,
      activeQuarterId: "",
    };
  }
  const o = raw as SavedPlanPayloadV1;
  const classes = Array.isArray(o.classes)
    ? (o.classes as ClassDossier[])
    : [];
  const commitments = Array.isArray(o.commitments)
    ? (o.commitments as ScheduleCommitment[])
    : [];
  const evaluation = o.evaluation ?? mockDossier.evaluation;
  const activeQuarterId =
    typeof o.activeQuarterId === "string" ? o.activeQuarterId : "";
  return { classes, commitments, evaluation, activeQuarterId };
}

export function buildPayloadFromMock(
  activeQuarterId: string,
): SavedPlanPayloadV1 {
  return {
    activeQuarterId,
    classes: mockDossier.classes,
    commitments: [],
    evaluation: mockDossier.evaluation,
  };
}

export function buildPayloadFromClasses(
  activeQuarterId: string,
  classes: ClassDossier[],
  commitments: ScheduleCommitment[] = [],
  evaluation: ScheduleEvaluation = mockDossier.evaluation,
): SavedPlanPayloadV1 {
  return {
    activeQuarterId,
    classes,
    commitments,
    evaluation,
  };
}
