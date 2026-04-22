"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, ChevronUp, ChevronDown, MessageSquare, Tag, MoreHorizontal, Download, Flag, FileText, Bookmark, Check, Trash2 } from "lucide-react";
import { toggleUpvote, togglePostDownvote, saveAttachmentToVault, deletePost } from "@/lib/api/community";
import { timeAgo, getInitials } from "@/lib/community/utils";
import { MarkdownBody } from "./MarkdownBody";
import { ReplyComposer } from "./ReplyComposer";
import { ReplyNode } from "./ReplyNode";
import { ImageLightbox } from "./ImageLightbox";
import type { PostAttachment, PostDetail, ReplyOut } from "@/types/community";

function PostAttachmentCard({ att, postId, postTitle }: { att: PostAttachment; postId: string; postTitle: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function close(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  function handleDownload() {
    if (!att.signedUrl) return;
    const a = document.createElement("a");
    a.href = att.signedUrl;
    a.download = att.name;
    a.target = "_blank";
    a.click();
    setMenuOpen(false);
  }

  async function handleSaveToVault() {
    setMenuOpen(false);
    try {
      await saveAttachmentToVault({ attachment: att, postId, postTitle });
      setSaved(true);
    } catch (err) {
      if (err instanceof Error && err.message === "already_saved") setSaved(true);
    }
  }

  const menu = (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
        className="flex h-5 w-5 items-center justify-center rounded bg-hub-bg/70 text-hub-text-muted opacity-0 group-hover:opacity-100 transition-opacity hover:text-hub-text backdrop-blur-sm"
        title="Options"
      >
        <MoreHorizontal className="h-3 w-3" />
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-6 z-50 min-w-[140px] rounded-lg border border-white/[0.1] bg-hub-surface-elevated shadow-xl py-1">
          <button type="button" onClick={handleDownload} className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-hub-text-secondary hover:bg-white/[0.06] transition-colors">
            <Download className="h-3.5 w-3.5" />
            Download file
          </button>
          <button type="button" onClick={handleSaveToVault} className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-hub-text-secondary hover:bg-white/[0.06] transition-colors">
            {saved ? <Check className="h-3.5 w-3.5 text-hub-success" /> : <Bookmark className="h-3.5 w-3.5" />}
            {saved ? "Saved!" : "Save to vault"}
          </button>
          <button type="button" onClick={() => setMenuOpen(false)} className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-hub-text-muted hover:bg-white/[0.06] transition-colors">
            <Flag className="h-3.5 w-3.5" />
            Report
          </button>
        </div>
      )}
    </div>
  );

  if (att.mimeType.startsWith("image/") && att.signedUrl) {
    return (
      <>
        <div
          className="group relative inline-block overflow-hidden rounded-lg border border-white/[0.08] cursor-zoom-in transition-all duration-200 hover:border-hub-cyan/30 hover:shadow-[0_0_16px_rgba(0,212,255,0.15)]"
          onClick={() => setLightboxOpen(true)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={att.signedUrl} alt={att.name} className="block max-h-72 max-w-xs object-contain transition-transform duration-200 group-hover:scale-[1.02]" />
          <div className="absolute top-1.5 right-1.5" onClick={(e) => e.stopPropagation()}>{menu}</div>
        </div>
        {lightboxOpen && (
          <ImageLightbox
            src={att.signedUrl}
            alt={att.name}
            onClose={() => setLightboxOpen(false)}
            onDownload={handleDownload}
          />
        )}
      </>
    );
  }

  return (
    <div className="group relative inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-hub-surface/50 px-3 py-2 transition-all hover:border-hub-cyan/25 hover:bg-hub-surface">
      <FileText className="h-3.5 w-3.5 shrink-0 text-hub-text-muted" />
      <span className="max-w-[200px] truncate text-[12px] text-hub-text-secondary">{att.name}</span>
      <div className="ml-1">{menu}</div>
    </div>
  );
}

const GENERAL_TAG_COLORS: Record<string, string> = {
  General: "bg-white/[0.08] text-hub-text-secondary",
  Classes: "bg-hub-cyan/10 text-hub-cyan",
  Advice: "bg-hub-gold/10 text-hub-gold",
};

type ThreadViewProps = {
  post: PostDetail;
};

function buildTree(flat: ReplyOut[]): ReplyOut[] {
  return flat.filter((r) => r.parentReplyId === null);
}

export function ThreadView({ post }: ThreadViewProps) {
  const router = useRouter();
  const [replies, setReplies] = useState<ReplyOut[]>(post.replies);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [confirmDeletePost, setConfirmDeletePost] = useState(false);
  const [deletingPost, setDeletingPost] = useState(false);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const handleReplyDeleted = useCallback((replyId: string) => {
    setReplies((prev) => prev.filter((r) => r.id !== replyId));
  }, []);

  const [upvoteCount, setUpvoteCount] = useState(post.upvoteCount);
  const [downvoteCount, setDownvoteCount] = useState(post.downvoteCount);
  const [userHasUpvoted, setUserHasUpvoted] = useState(post.userHasUpvoted);
  const [userHasDownvoted, setUserHasDownvoted] = useState(post.userHasDownvoted);
  const [voting, setVoting] = useState(false);

  const score = upvoteCount - downvoteCount;
  const rootReplies = buildTree(replies);
  const isPostOwner = !!currentUserId && currentUserId === post.userId;

  async function handleDeletePost() {
    if (deletingPost) return;
    setDeletingPost(true);
    try {
      await deletePost(post.id);
      router.push("/community");
    } catch {
      setConfirmDeletePost(false);
      setDeletingPost(false);
    }
  }

  async function handleUpvote() {
    if (voting) return;
    const prev = { upvoteCount, userHasUpvoted, downvoteCount, userHasDownvoted };
    setUserHasUpvoted(!userHasUpvoted);
    setUpvoteCount((c) => (userHasUpvoted ? c - 1 : c + 1));
    if (userHasDownvoted) {
      setUserHasDownvoted(false);
      setDownvoteCount((c) => c - 1);
    }
    setVoting(true);
    try {
      const res = await toggleUpvote(post.id);
      setUserHasUpvoted(res.upvoted);
      setUpvoteCount(res.upvoteCount);
    } catch {
      setUserHasUpvoted(prev.userHasUpvoted);
      setUpvoteCount(prev.upvoteCount);
      setUserHasDownvoted(prev.userHasDownvoted);
      setDownvoteCount(prev.downvoteCount);
    } finally {
      setVoting(false);
    }
  }

  async function handleDownvote() {
    if (voting) return;
    const prev = { upvoteCount, userHasUpvoted, downvoteCount, userHasDownvoted };
    setUserHasDownvoted(!userHasDownvoted);
    setDownvoteCount((c) => (userHasDownvoted ? c - 1 : c + 1));
    if (userHasUpvoted) {
      setUserHasUpvoted(false);
      setUpvoteCount((c) => c - 1);
    }
    setVoting(true);
    try {
      const res = await togglePostDownvote(post.id);
      setUserHasDownvoted(res.voted);
      setDownvoteCount(res.downvoteCount);
      setUpvoteCount(res.upvoteCount);
    } catch {
      setUserHasUpvoted(prev.userHasUpvoted);
      setUpvoteCount(prev.upvoteCount);
      setUserHasDownvoted(prev.userHasDownvoted);
      setDownvoteCount(prev.downvoteCount);
    } finally {
      setVoting(false);
    }
  }

  return (
    <div className="w-full px-8 py-8">
      <Link
        href="/community"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-hub-text-muted underline-offset-2 transition hover:text-hub-cyan hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Community
      </Link>

      {/* Original post */}
      <div className="glass-panel mb-6 rounded-xl border border-white/[0.08] p-6">
        {/* Tags row */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {post.generalTags?.map((tag) => (
            <span
              key={tag}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${GENERAL_TAG_COLORS[tag] ?? "bg-white/[0.06] text-hub-text-muted"}`}
            >
              {tag}
            </span>
          ))}
          {post.courseCode && (
            <span className="inline-flex items-center gap-1 rounded-md bg-hub-cyan/10 px-2 py-0.5 text-xs font-medium text-hub-cyan">
              <Tag className="h-3 w-3" />
              {post.courseCode}
            </span>
          )}
          {post.professorName && (
            <span className="text-xs text-hub-text-muted">{post.professorName}</span>
          )}
        </div>

        <h1 className="mb-4 text-2xl font-bold text-hub-text">{post.title}</h1>
        <MarkdownBody>{post.body}</MarkdownBody>

        {/* Attached files */}
        {post.attachments.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            {post.attachments.map((att) => (
              <PostAttachmentCard key={att.id} att={att} postId={post.id} postTitle={post.title} />
            ))}
          </div>
        )}

        {/* Author row + votes */}
        <div className="mt-5 flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-hub-cyan/20 text-xs font-semibold text-hub-cyan">
            {getInitials(post.authorDisplayName)}
          </div>
          <span className="text-xs text-hub-text-muted">{post.authorDisplayName}</span>
          <span className="text-xs text-hub-text-muted">·</span>
          <span className="text-xs text-hub-text-muted">{timeAgo(post.createdAt)}</span>

          {/* Vote row + owner delete */}
          <div className="ml-auto flex items-center gap-2">
            {isPostOwner && (
              <div className="flex items-center">
                {confirmDeletePost ? (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-hub-danger/40 bg-hub-bg px-2 py-1">
                    <span className="text-[11px] text-hub-danger">Delete post?</span>
                    <button
                      type="button"
                      onClick={handleDeletePost}
                      disabled={deletingPost}
                      className="text-[11px] font-semibold text-hub-danger hover:text-hub-danger/80 disabled:opacity-50 transition"
                    >
                      {deletingPost ? "…" : "Yes"}
                    </button>
                    <span className="text-hub-text-muted text-[11px]">/</span>
                    <button
                      type="button"
                      onClick={() => setConfirmDeletePost(false)}
                      className="text-[11px] text-hub-text-muted hover:text-hub-text transition"
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeletePost(true)}
                    aria-label="Delete post"
                    className="flex h-7 w-7 items-center justify-center rounded-full text-hub-text-muted hover:text-hub-danger transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          <div className="flex items-center gap-0.5 rounded-full bg-white/[0.06] px-1.5 py-1">
            <button
              type="button"
              onClick={handleUpvote}
              disabled={voting}
              aria-label="Upvote"
              className={`flex h-6 w-6 items-center justify-center rounded-full transition disabled:opacity-50 ${
                userHasUpvoted ? "text-hub-cyan" : "text-hub-text-muted hover:text-hub-cyan"
              }`}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <span
              className={`min-w-[2rem] text-center text-sm font-medium tabular-nums ${
                score > 0 ? "text-hub-cyan" : score < 0 ? "text-hub-danger" : "text-hub-text-muted"
              }`}
            >
              {score}
            </span>
            <button
              type="button"
              onClick={handleDownvote}
              disabled={voting}
              aria-label="Downvote"
              className={`flex h-6 w-6 items-center justify-center rounded-full transition disabled:opacity-50 ${
                userHasDownvoted ? "text-hub-danger" : "text-hub-text-muted hover:text-hub-danger"
              }`}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
          </div>
        </div>
      </div>

      {/* Replies section header */}
      <div className="mb-5 flex items-center gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-hub-text-muted/60">
          {replies.length} {replies.length === 1 ? "comment" : "comments"}
        </h2>
        <div className="flex-1 h-px bg-white/[0.05]" />
      </div>

      {/* Bottom reply composer — sits at top of comment section like Reddit */}
      <div className="mb-8">
        <ReplyComposer
          postId={post.id}
          onSubmitted={setReplies}
        />
      </div>

      {/* Reply tree — flat against the page, no cards */}
      <div className="flex flex-col">
        {rootReplies.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <MessageSquare className="h-7 w-7 text-hub-text-muted/25" />
            <p className="text-sm text-hub-text-muted/50">No replies yet. Be the first to respond!</p>
          </div>
        ) : (
          rootReplies.map((reply, i) => (
            <div
              key={reply.id}
              className={`py-4 ${i < rootReplies.length - 1 ? "border-b border-white/[0.05]" : ""}`}
            >
              <ReplyNode
                reply={reply}
                postId={post.id}
                postTitle={post.title}
                depth={0}
                childReplies={replies.filter((r) => r.parentReplyId === reply.id)}
                allReplies={replies}
                onRepliesUpdated={setReplies}
                currentUserId={currentUserId}
                onDeleted={handleReplyDeleted}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
