"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import type { SidebarPlanRow } from "@/components/layout/LeftSidebar";
import type { VaultItem } from "@/types/dossier";

export function GlobalSidebar() {
  const router = useRouter();
  const [plans, setPlans] = useState<SidebarPlanRow[]>([]);
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      setSynced(true);

      const [{ data: plansData }, { data: vaultData }] = await Promise.all([
        supabase
          .from("saved_plans")
          .select("id, title, updated_at")
          .neq("is_deleted", true)
          .order("updated_at", { ascending: false })
          .limit(20),
        supabase
          .from("vault_items")
          .select("id, name, kind, mime_type, size_bytes, updated_at, storage_path, community_post_id, community_reply_id, community_post_title, community_reply_preview")
          .order("updated_at", { ascending: false })
          .limit(50),
      ]);

      if (cancelled) return;

      setPlans(
        (plansData ?? []).map((p) => ({
          id: p.id as string,
          label: (p.title as string) || "Untitled plan",
          updatedAt: p.updated_at as string,
        })),
      );

      const items: VaultItem[] = await Promise.all(
        (vaultData ?? []).map(async (v) => {
          let signedUrl: string | undefined;
          const storagePath = v.storage_path as string | null;
          if (storagePath) {
            const { data } = await supabase.storage
              .from("user-content")
              .createSignedUrl(storagePath, 3600);
            signedUrl = data?.signedUrl ?? undefined;
          }
          return {
            id: v.id as string,
            name: v.name as string,
            kind: (v.kind as VaultItem["kind"]) ?? "doc",
            mimeType: (v.mime_type as string | null) ?? null,
            sizeBytes: (v.size_bytes as number | null) ?? null,
            updatedAt: v.updated_at as string,
            signedUrl,
            communityPostId: (v.community_post_id as string | null) ?? null,
            communityReplyId: (v.community_reply_id as string | null) ?? null,
            communityPostTitle: (v.community_post_title as string | null) ?? null,
            communityReplyPreview: (v.community_reply_preview as string | null) ?? null,
          };
        }),
      );

      if (!cancelled) setVaultItems(items);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <LeftSidebar
      planSectionTitle="Saved plans"
      plans={plans}
      activePlanId=""
      onSelectPlan={(id) => router.push(`/?planId=${id}`)}
      newPlanLabel="Go to workspace"
      onNewPlan={() => router.push("/")}
      vaultItems={vaultItems}
      vaultSynced={synced}
    />
  );
}
