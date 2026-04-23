import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CommunityHub } from "@/components/community/CommunityHub";
import type { PostSummary } from "@/types/community";

type CommunityPageProps = {
  searchParams?: Promise<{
    composeCourse?: string;
    composeProfessor?: string;
  }>;
};

export default async function CommunityPage({ searchParams }: CommunityPageProps) {
  const resolvedSearchParams = await searchParams;
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

  const posts: PostSummary[] = await Promise.all(
    (rawPosts ?? []).map(async (row) => {
      const avatarPath = (row.author_avatar_path as string | null) ?? null;
      let authorAvatarUrl: string | null = null;
      if (avatarPath) {
        const { data: signed } = await supabase.storage
          .from("user-content")
          .createSignedUrl(avatarPath, 60 * 60 * 24);
        authorAvatarUrl = signed?.signedUrl ?? null;
      }

      return {
        id: row.id as string,
        userId: row.user_id as string,
        title: row.title as string,
        body: row.body as string,
        courseCode: (row.course_code as string | null) ?? null,
        professorName: (row.professor_name as string | null) ?? null,
        isAnonymous: (row.is_anonymous as boolean) ?? false,
        generalTags: (row.general_tags as string[]) ?? [],
        authorDisplayName: (row.author_display_name as string) ?? "Anonymous",
        authorAvatarUrl,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        replyCount: (row.reply_count as number) ?? 0,
        upvoteCount: (row.upvote_count as number) ?? 0,
        downvoteCount: (row.downvote_count as number) ?? 0,
        userHasUpvoted: (row.user_has_upvoted as boolean) ?? false,
        userHasDownvoted: (row.user_has_downvoted as boolean) ?? false,
      };
    }),
  );

  return (
    <CommunityHub
      initialPosts={posts}
      initialTotal={count ?? 0}
      userId={user.id}
      initialComposeCourseCode={resolvedSearchParams?.composeCourse ?? ""}
      initialComposeProfessorName={resolvedSearchParams?.composeProfessor ?? ""}
    />
  );
}
