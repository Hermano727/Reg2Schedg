import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ThreadView } from "@/components/community/ThreadView";
import type { PostDetail, ReplyOut } from "@/types/community";

type Props = {
  params: Promise<{ postId: string }>;
};

export default async function ThreadPage({ params }: Props) {
  const { postId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/community/${postId}`);
  }

  const { data: rawPost } = await supabase
    .from("community_posts_with_author")
    .select("*")
    .eq("id", postId)
    .maybeSingle();

  if (!rawPost) {
    notFound();
  }

  const { data: rawReplies } = await supabase
    .from("community_replies_with_author")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  const replies: ReplyOut[] = (rawReplies ?? []).map((row) => ({
    id: row.id as string,
    postId: row.post_id as string,
    userId: row.user_id as string,
    body: row.body as string,
    authorDisplayName: (row.author_display_name as string) ?? "Anonymous",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));

  const post: PostDetail = {
    id: rawPost.id as string,
    userId: rawPost.user_id as string,
    title: rawPost.title as string,
    body: rawPost.body as string,
    courseCode: (rawPost.course_code as string | null) ?? null,
    authorDisplayName: (rawPost.author_display_name as string) ?? "Anonymous",
    createdAt: rawPost.created_at as string,
    updatedAt: rawPost.updated_at as string,
    replyCount: (rawPost.reply_count as number) ?? 0,
    replies,
  };

  return <ThreadView post={post} />;
}
