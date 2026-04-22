import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ThreadView } from "@/components/community/ThreadView";
import type { PostAttachment, PostDetail, ReplyOut } from "@/types/community";

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

  const replyIds = (rawReplies ?? []).map((row) => row.id as string);
  let attachmentsQuery = supabase
    .from("community_attachments")
    .select("id, post_id, reply_id, storage_path, name, mime_type, size_bytes");

  if (replyIds.length > 0) {
    attachmentsQuery = attachmentsQuery.or(`post_id.eq.${postId},reply_id.in.(${replyIds.join(",")})`);
  } else {
    attachmentsQuery = attachmentsQuery.eq("post_id", postId);
  }

  const { data: rawAttachments } = await attachmentsQuery.order("created_at", { ascending: true });

  const signedAttachments = await Promise.all(
    (rawAttachments ?? []).map(async (row) => {
      const { data: signed } = await supabase.storage
        .from("user-content")
        .createSignedUrl(row.storage_path as string, 3600);
      return {
        id: row.id as string,
        replyId: (row.reply_id as string | null) ?? null,
        postId: (row.post_id as string | null) ?? null,
        storagePath: row.storage_path as string,
        name: row.name as string,
        mimeType: row.mime_type as string,
        sizeBytes: row.size_bytes as number,
        signedUrl: signed?.signedUrl ?? undefined,
      };
    }),
  );

  const postAttachments: PostAttachment[] = signedAttachments
    .filter((row) => row.postId === postId && row.replyId === null)
    .map((row) => ({
      id: row.id,
      storagePath: row.storagePath,
      name: row.name,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      signedUrl: row.signedUrl,
    }));

  const replyAttachmentsByReplyId = new Map<string, PostAttachment[]>();
  signedAttachments
    .filter((row) => row.replyId)
    .forEach((row) => {
      const attachment: PostAttachment = {
        id: row.id,
        storagePath: row.storagePath,
        name: row.name,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        signedUrl: row.signedUrl,
      };
      const replyId = row.replyId;
      const rid = replyId as string;
      const existing = replyAttachmentsByReplyId.get(rid) ?? [];
      existing.push(attachment);
      replyAttachmentsByReplyId.set(rid, existing);
    });

  const replies: ReplyOut[] = (rawReplies ?? []).map((row) => ({
    id: row.id as string,
    postId: row.post_id as string,
    userId: row.user_id as string,
    body: row.body as string,
    parentReplyId: (row.parent_reply_id as string | null) ?? null,
    isAnonymous: (row.is_anonymous as boolean) ?? false,
    isDeleted: (row.is_deleted as boolean) ?? false,
    editedAt: (row.edited_at as string | null) ?? null,
    authorDisplayName: (row.author_display_name as string) ?? "Anonymous",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    upvoteCount: (row.upvote_count as number) ?? 0,
    downvoteCount: (row.downvote_count as number) ?? 0,
    userHasUpvoted: (row.user_has_upvoted as boolean) ?? false,
    userHasDownvoted: (row.user_has_downvoted as boolean) ?? false,
    attachments: replyAttachmentsByReplyId.get(row.id as string) ?? [],
  }));

  const post: PostDetail = {
    id: rawPost.id as string,
    userId: rawPost.user_id as string,
    title: rawPost.title as string,
    body: rawPost.body as string,
    courseCode: (rawPost.course_code as string | null) ?? null,
    professorName: (rawPost.professor_name as string | null) ?? null,
    isAnonymous: (rawPost.is_anonymous as boolean) ?? false,
    generalTags: (rawPost.general_tags as string[]) ?? [],
    authorDisplayName: (rawPost.author_display_name as string) ?? "Anonymous",
    createdAt: rawPost.created_at as string,
    updatedAt: rawPost.updated_at as string,
    replyCount: (rawPost.reply_count as number) ?? 0,
    upvoteCount: (rawPost.upvote_count as number) ?? 0,
    downvoteCount: (rawPost.downvote_count as number) ?? 0,
    userHasUpvoted: (rawPost.user_has_upvoted as boolean) ?? false,
    userHasDownvoted: (rawPost.user_has_downvoted as boolean) ?? false,
    replies,
    attachments: postAttachments,
  };

  return <ThreadView post={post} />;
}
