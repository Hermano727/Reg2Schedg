export type HubUser = {
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  id?: string;
  needsOnboarding?: boolean;
};
