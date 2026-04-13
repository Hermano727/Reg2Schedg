"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronUp, MessageSquare, Tag } from "lucide-react";
import { createReply, toggleUpvote } from "@/lib/api/community";
import { timeAgo, getInitials } from "@/lib/community/utils";
import type { PostDetail, ReplyOut } from "@/types/community";

type ThreadViewProps = {
  post: PostDetail;
};

export function ThreadView({ post }: ThreadViewProps) {
  const [replies, setReplies] = useState<ReplyOut[]>(post.replies);
  const [replyBody, setReplyBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [upvoteCount, setUpvoteCount] = useState(post.upvoteCount);
  const [userHasUpvoted, setUserHasUpvoted] = useState(post.userHasUpvoted);
  const [upvoting, setUpvoting] = useState(false);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyBody.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await createReply(post.id, { body: replyBody.trim() });
      setReplies(updated.replies);
      setReplyBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post reply");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpvote() {
    if (upvoting) return;
    const wasUpvoted = userHasUpvoted;
    setUserHasUpvoted(!wasUpvoted);
    setUpvoteCount((c) => (wasUpvoted ? c - 1 : c + 1));
    setUpvoting(true);
    try {
      const res = await toggleUpvote(post.id);
      setUserHasUpvoted(res.upvoted);
      setUpvoteCount(res.upvoteCount);
    } catch {
      setUserHasUpvoted(wasUpvoted);
      setUpvoteCount((c) => (wasUpvoted ? c + 1 : c - 1));
    } finally {
      setUpvoting(false);
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
        <div className="mb-3 flex flex-wrap items-center gap-2">
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
        <p className="whitespace-pre-wrap text-sm text-hub-text-secondary">
          {post.body}
        </p>

        {/* Author row + upvote */}
        <div className="mt-5 flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-hub-cyan/20 text-xs font-semibold text-hub-cyan">
            {getInitials(post.authorDisplayName)}
          </div>
          <span className="text-xs text-hub-text-muted">{post.authorDisplayName}</span>
          <span className="text-xs text-hub-text-muted">·</span>
          <span className="text-xs text-hub-text-muted">{timeAgo(post.createdAt)}</span>

          <button
            type="button"
            onClick={handleUpvote}
            disabled={upvoting}
            aria-label={userHasUpvoted ? "Remove upvote" : "Upvote this post"}
            className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition disabled:opacity-60 ${
              userHasUpvoted
                ? "bg-hub-cyan/15 text-hub-cyan"
                : "bg-white/[0.06] text-hub-text-muted hover:bg-hub-cyan/10 hover:text-hub-cyan"
            }`}
          >
            <ChevronUp className="h-4 w-4" />
            {upvoteCount} {upvoteCount === 1 ? "upvote" : "upvotes"}
          </button>
        </div>
      </div>

      {/* Replies */}
      <h2 className="mb-3 text-sm font-semibold text-hub-text-secondary">
        {replies.length} {replies.length === 1 ? "Reply" : "Replies"}
      </h2>

      <div className="mb-6 flex flex-col gap-3">
        {replies.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <MessageSquare className="h-8 w-8 text-hub-text-muted/40" />
            <p className="text-sm text-hub-text-muted">No replies yet. Be the first to respond!</p>
          </div>
        ) : (
          replies.map((reply, idx) => (
            <div
              key={reply.id}
              className="glass-panel rounded-xl border border-white/[0.08] p-4"
            >
              <div className="mb-2 flex items-center gap-2.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-hub-cyan/10 text-[10px] font-semibold text-hub-cyan">
                  {getInitials(reply.authorDisplayName)}
                </div>
                <span className="text-xs font-medium text-hub-text-secondary">{reply.authorDisplayName}</span>
                <span className="text-xs text-hub-text-muted">·</span>
                <span className="text-xs text-hub-text-muted">{timeAgo(reply.createdAt)}</span>
                <span className="ml-auto text-xs text-hub-text-muted/50">#{idx + 1}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-hub-text-secondary">
                {reply.body}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Reply form */}
      <div className="glass-panel rounded-xl border border-white/[0.08] p-5">
        <h3 className="mb-3 text-sm font-semibold text-hub-text">
          Add a Reply
        </h3>
        <form onSubmit={handleReply} className="flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs text-hub-text-muted">
              You
            </div>
            <textarea
              required
              rows={4}
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder="Write your reply…"
              className="w-full resize-none rounded-lg border border-white/[0.08] bg-hub-bg/80 px-3 py-2.5 text-sm text-hub-text outline-none ring-hub-cyan/40 placeholder:text-hub-text-muted focus:border-hub-cyan/40 focus:ring-2"
            />
          </div>
          {error && <p className="text-sm text-hub-danger">{error}</p>}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="h-9 rounded-lg bg-hub-cyan px-4 text-sm font-medium text-hub-bg transition hover:brightness-110 disabled:opacity-60"
            >
              {loading ? "Posting…" : "Reply"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
