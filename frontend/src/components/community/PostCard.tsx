"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronUp, MessageSquare, Tag } from "lucide-react";
import { toggleUpvote } from "@/lib/api/community";
import { timeAgo, getInitials } from "@/lib/community/utils";
import type { PostSummary } from "@/types/community";

type PostCardProps = {
  post: PostSummary;
};

export function PostCard({ post }: PostCardProps) {
  const [upvoteCount, setUpvoteCount] = useState(post.upvoteCount);
  const [userHasUpvoted, setUserHasUpvoted] = useState(post.userHasUpvoted);
  const [upvoting, setUpvoting] = useState(false);

  async function handleUpvote(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (upvoting) return;
    const wasUpvoted = userHasUpvoted;
    // Optimistic update
    setUserHasUpvoted(!wasUpvoted);
    setUpvoteCount((c) => (wasUpvoted ? c - 1 : c + 1));
    setUpvoting(true);
    try {
      const res = await toggleUpvote(post.id);
      setUserHasUpvoted(res.upvoted);
      setUpvoteCount(res.upvoteCount);
    } catch {
      // Roll back optimistic update on failure
      setUserHasUpvoted(wasUpvoted);
      setUpvoteCount((c) => (wasUpvoted ? c + 1 : c - 1));
    } finally {
      setUpvoting(false);
    }
  }

  return (
    <Link
      href={`/community/${post.id}`}
      className="glass-panel group relative block overflow-hidden rounded-xl border border-white/[0.08] p-5 transition hover:border-hub-cyan/30 hover:bg-hub-surface-elevated/60 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-transparent before:transition hover:before:bg-hub-cyan"
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          {post.courseCode && (
            <span className="inline-flex items-center gap-1 rounded-md bg-hub-cyan/10 px-2 py-0.5 text-xs font-medium text-hub-cyan">
              <Tag className="h-3 w-3" />
              {post.courseCode}
            </span>
          )}
          {post.professorName && (
            <span className="text-xs text-hub-text-muted">
              {post.professorName}
            </span>
          )}
        </div>
        <h3 className="mb-1 line-clamp-1 font-semibold text-hub-text">
          {post.title}
        </h3>
        <p className="line-clamp-2 text-sm text-hub-text-secondary">
          {post.body}
        </p>
      </div>

      <div className="mt-3 flex items-center gap-2.5">
        {/* Author avatar */}
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-hub-cyan/20 text-[10px] font-semibold text-hub-cyan">
          {getInitials(post.authorDisplayName)}
        </div>
        <span className="text-xs text-hub-text-muted">{post.authorDisplayName}</span>
        <span className="text-xs text-hub-text-muted">·</span>
        <span className="text-xs text-hub-text-muted">{timeAgo(post.createdAt)}</span>

        {/* Action pills */}
        <div className="ml-auto flex items-center gap-1.5">
          {/* Upvote */}
          <button
            type="button"
            onClick={handleUpvote}
            disabled={upvoting}
            aria-label={userHasUpvoted ? "Remove upvote" : "Upvote"}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition disabled:opacity-60 ${
              userHasUpvoted
                ? "bg-hub-cyan/15 text-hub-cyan"
                : "bg-white/[0.06] text-hub-text-muted hover:bg-hub-cyan/10 hover:text-hub-cyan"
            }`}
          >
            <ChevronUp className="h-3.5 w-3.5" />
            {upvoteCount}
          </button>

          {/* Reply count */}
          <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-hub-text-muted">
            <MessageSquare className="h-3.5 w-3.5" />
            {post.replyCount}
          </span>
        </div>
      </div>
    </Link>
  );
}
