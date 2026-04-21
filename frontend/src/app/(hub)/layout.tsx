import type { ReactNode } from "react";
import { HubShell } from "@/components/layout/HubShell";
import { createClient } from "@/lib/supabase/server";

export default async function HubLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let hubUser = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url, onboarding_complete")
      .eq("id", user.id)
      .maybeSingle();
    const email = user.email ?? "";

    let avatarUrl: string | null = null;
    const rawAvatar = (profile as { avatar_url?: string | null } | null)?.avatar_url;
    if (rawAvatar) {
      const { data: signed } = await supabase.storage
        .from("user-content")
        .createSignedUrl(rawAvatar, 60 * 60 * 24 * 7); // 7-day for header
      avatarUrl = signed?.signedUrl ?? null;
    }

    const onboardingComplete = (profile as { onboarding_complete?: boolean } | null)?.onboarding_complete ?? false;

    hubUser = {
      id: user.id,
      email,
      displayName: profile?.display_name?.trim() || email.split("@")[0] || "User",
      avatarUrl,
      needsOnboarding: !onboardingComplete,
    };
  }

  return <HubShell user={hubUser}>{children}</HubShell>;
}
