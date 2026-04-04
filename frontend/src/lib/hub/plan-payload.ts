import { mockDossier } from "@/lib/mock/dossier";
import type {
  ClassDossier,
  ScheduleEvaluation,
} from "@/types/dossier";

export type SavedPlanPayloadV1 = {
  activeQuarterId?: string;
  classes?: ClassDossier[];
  evaluation?: ScheduleEvaluation;
};

export function parsePlanPayload(raw: unknown): {
  classes: ClassDossier[];
  evaluation: ScheduleEvaluation;
  activeQuarterId: string;
} {
  if (!raw || typeof raw !== "object") {
    return {
      classes: [],
      evaluation: mockDossier.evaluation,
      activeQuarterId: "",
    };
  }
  const o = raw as SavedPlanPayloadV1;
  const classes = Array.isArray(o.classes)
    ? (o.classes as ClassDossier[])
    : [];
  const evaluation = o.evaluation ?? mockDossier.evaluation;
  const activeQuarterId =
    typeof o.activeQuarterId === "string" ? o.activeQuarterId : "";
  return { classes, evaluation, activeQuarterId };
}

export function buildPayloadFromMock(
  activeQuarterId: string,
): SavedPlanPayloadV1 {
  return {
    activeQuarterId,
    classes: mockDossier.classes,
    evaluation: mockDossier.evaluation,
  };
}

export function buildPayloadFromClasses(
  activeQuarterId: string,
  classes: ClassDossier[],
  evaluation: ScheduleEvaluation = mockDossier.evaluation,
): SavedPlanPayloadV1 {
  return {
    activeQuarterId,
    classes,
    evaluation,
  };
}
