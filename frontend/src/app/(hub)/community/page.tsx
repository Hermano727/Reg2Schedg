import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CommunityHub } from "@/components/community/CommunityHub";
import type { PostSummary } from "@/types/community";

type CommunityPageProps = {
  searchParams?: {
    composeCourse?: string;
    composeProfessor?: string;
  };
};

export default async function CommunityPage({ searchParams }: CommunityPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/community");
  }

  const [{ data: rawPosts }, { count }] = await Promise.all([
    supabase
      .from("community_posts_with_author")
      .select("*")
      .order("created_at", { ascending: false })
      .range(0, 19),
    supabase
      .from("community_posts_with_author")
      .select("*", { count: "exact", head: true }),
  ]);

  const posts: PostSummary[] = (rawPosts ?? []).map((row) => ({
    id: row.id as string,
    userId: row.user_id as string,
    title: row.title as string,
    body: row.body as string,
    courseCode: (row.course_code as string | null) ?? null,
    professorName: (row.professor_name as string | null) ?? null,
    isAnonymous: (row.is_anonymous as boolean) ?? false,
    generalTags: (row.general_tags as string[]) ?? [],
    authorDisplayName: (row.author_display_name as string) ?? "Anonymous",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    replyCount: (row.reply_count as number) ?? 0,
    upvoteCount: (row.upvote_count as number) ?? 0,
    downvoteCount: (row.downvote_count as number) ?? 0,
    userHasUpvoted: (row.user_has_upvoted as boolean) ?? false,
    userHasDownvoted: (row.user_has_downvoted as boolean) ?? false,
  }));

  return (
    <CommunityHub
      initialPosts={posts}
      initialTotal={count ?? 0}
      userId={user.id}
      initialComposeCourseCode={searchParams?.composeCourse ?? ""}
      initialComposeProfessorName={searchParams?.composeProfessor ?? ""}
    />
  );
}
