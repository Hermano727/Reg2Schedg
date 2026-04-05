import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CommunityHub } from "@/components/community/CommunityHub";
import type { PostSummary } from "@/types/community";

export default async function CommunityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/community");
  }

  const { data: rawPosts } = await supabase
    .from("community_posts_with_author")
    .select("*")
    .order("created_at", { ascending: false })
    .range(0, 19);

  const { count } = await supabase
    .from("community_posts_with_author")
    .select("*", { count: "exact", head: true });

  const posts: PostSummary[] = (rawPosts ?? []).map((row) => ({
    id: row.id as string,
    userId: row.user_id as string,
    title: row.title as string,
    body: row.body as string,
    courseCode: (row.course_code as string | null) ?? null,
    authorDisplayName: (row.author_display_name as string) ?? "Anonymous",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    replyCount: (row.reply_count as number) ?? 0,
  }));

  return <CommunityHub initialPosts={posts} initialTotal={count ?? 0} />;
}
