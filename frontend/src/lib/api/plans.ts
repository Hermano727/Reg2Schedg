import type { CourseResearchResult } from "@/lib/api/parse";
import { getApiBaseUrl } from "@/lib/api/client";
import { courseResearchResultToDossier } from "@/lib/mappers/courseEntryToDossier";
import { mockDossier } from "@/lib/mock/dossier";
import type {
  ClassDossier,
  ScheduleCommitment,
  ScheduleEvaluation,
} from "@/types/dossier";

type ExpandedPlanResponse = {
  plan_id: string;
  payload_version?: number;
  title?: string | null;
  quarter_label?: string | null;
  classes: CourseResearchResult[] | ClassDossier[];
  evaluation: ScheduleEvaluation | null;
  commitments: ScheduleCommitment[];
  course_labels?: Record<string, string>;
};

export type ExpandedPlanData = {
  planId: string;
  payloadVersion: number;
  title: string | null;
  quarterLabel: string | null;
  classes: ClassDossier[];
  evaluation: ScheduleEvaluation;
  commitments: ScheduleCommitment[];
  courseLabels: Record<string, string>;
};

function mapExpandedPlanResponse(data: ExpandedPlanResponse): ExpandedPlanData {
  const payloadVersion = data.payload_version ?? 1;
  const classes = payloadVersion === 1
    ? (data.classes ?? []) as ClassDossier[]
    : (data.classes ?? []).map((entry) => courseResearchResultToDossier(entry as CourseResearchResult));

  return {
    planId: data.plan_id,
    payloadVersion,
    title: data.title ?? null,
    quarterLabel: data.quarter_label ?? null,
    classes,
    evaluation: data.evaluation ?? mockDossier.evaluation,
    commitments: data.commitments ?? [],
    courseLabels: data.course_labels ?? {},
  };
}

export async function fetchExpandedPlan(
  planId: string,
  accessToken: string,
): Promise<ExpandedPlanData | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/plans/${planId}/expanded`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as ExpandedPlanResponse;
    return mapExpandedPlanResponse(data);
  } catch {
    return null;
  }
}

export async function fetchPublicDemoPlan(): Promise<ExpandedPlanData | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/demo-plan/expanded`);
    if (!res.ok) return null;
    const data = await res.json() as ExpandedPlanResponse;
    return mapExpandedPlanResponse(data);
  } catch {
    return null;
  }
}
