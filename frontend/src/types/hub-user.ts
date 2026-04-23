export type HubUserSubmissionQuota = {
  submissionsRemaining: number;
  resetsAtLabel: string;
  showInHeader: boolean;
};

export type HubUser = {
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  id?: string;
  needsOnboarding?: boolean;
  submissionQuota?: HubUserSubmissionQuota | null;
};
