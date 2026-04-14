"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronUp, ChevronDown, MessageSquare, Tag } from "lucide-react";
import { toggleUpvote, togglePostDownvote } from "@/lib/api/community";
import { timeAgo, getInitials } from "@/lib/community/utils";
import { MarkdownBody } from "./MarkdownBody";
import { ReplyComposer } from "./ReplyComposer";
import { ReplyNode } from "./ReplyNode";
import type { PostDetail, ReplyOut } from "@/types/community";

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
  const [replies, setReplies] = useState<ReplyOut[]>(post.replies);

  const [upvoteCount, setUpvoteCount] = useState(post.upvoteCount);
  const [downvoteCount, setDownvoteCount] = useState(post.downvoteCount);
  const [userHasUpvoted, setUserHasUpvoted] = useState(post.userHasUpvoted);
  const [userHasDownvoted, setUserHasDownvoted] = useState(post.userHasDownvoted);
  const [voting, setVoting] = useState(false);

  const score = upvoteCount - downvoteCount;
  const rootReplies = buildTree(replies);

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

        {/* Author row + votes */}
        <div className="mt-5 flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-hub-cyan/20 text-xs font-semibold text-hub-cyan">
            {getInitials(post.authorDisplayName)}
          </div>
          <span className="text-xs text-hub-text-muted">{post.authorDisplayName}</span>
          <span className="text-xs text-hub-text-muted">·</span>
          <span className="text-xs text-hub-text-muted">{timeAgo(post.createdAt)}</span>

          {/* Vote row */}
          <div className="ml-auto flex items-center gap-0.5 rounded-full bg-white/[0.06] px-1.5 py-1">
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
                depth={0}
                children={replies.filter((r) => r.parentReplyId === reply.id)}
                allReplies={replies}
                onRepliesUpdated={setReplies}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
