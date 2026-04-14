"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { toggleReplyUpvote, toggleReplyDownvote } from "@/lib/api/community";
import { timeAgo, getInitials } from "@/lib/community/utils";
import { MarkdownBody } from "./MarkdownBody";
import { ReplyComposer } from "./ReplyComposer";
import type { ReplyOut } from "@/types/community";

const MAX_VISUAL_DEPTH = 6;

// Depth line colors shift from cyan → slate as nesting deepens
const DEPTH_LINE_COLORS = [
  "border-hub-cyan/25 hover:border-hub-cyan/50",
  "border-hub-cyan/18 hover:border-hub-cyan/38",
  "border-[rgba(100,160,200,0.15)] hover:border-[rgba(100,160,200,0.32)]",
  "border-[rgba(80,120,170,0.13)] hover:border-[rgba(80,120,170,0.28)]",
  "border-white/[0.08] hover:border-white/[0.18]",
  "border-white/[0.05] hover:border-white/[0.12]",
];

type ReplyNodeProps = {
  reply: ReplyOut;
  postId: string;
  depth: number;
  children: ReplyOut[];
  allReplies: ReplyOut[];
  onRepliesUpdated: (replies: ReplyOut[]) => void;
};

export function ReplyNode({
  reply,
  postId,
  depth,
  children,
  allReplies,
  onRepliesUpdated,
}: ReplyNodeProps) {
  const [upvoteCount, setUpvoteCount] = useState(reply.upvoteCount);
  const [downvoteCount, setDownvoteCount] = useState(reply.downvoteCount);
  const [userHasUpvoted, setUserHasUpvoted] = useState(reply.userHasUpvoted);
  const [userHasDownvoted, setUserHasDownvoted] = useState(reply.userHasDownvoted);
  const [voting, setVoting] = useState(false);
  const [showReplyComposer, setShowReplyComposer] = useState(false);

  const score = upvoteCount - downvoteCount;
  const visualDepth = Math.min(depth, MAX_VISUAL_DEPTH);
  const depthLineClass = DEPTH_LINE_COLORS[Math.max(0, visualDepth - 1)] ?? DEPTH_LINE_COLORS[5];

  async function handleUpvote() {
    if (voting) return;
    const prev = { upvoteCount, userHasUpvoted };
    setUserHasUpvoted(!userHasUpvoted);
    setUpvoteCount((c) => (userHasUpvoted ? c - 1 : c + 1));
    if (userHasDownvoted) {
      setUserHasDownvoted(false);
      setDownvoteCount((c) => c - 1);
    }
    setVoting(true);
    try {
      const res = await toggleReplyUpvote(postId, reply.id);
      setUserHasUpvoted(res.voted);
      setUpvoteCount(res.upvoteCount);
      setDownvoteCount(res.downvoteCount);
      setUserHasDownvoted(false);
    } catch {
      setUserHasUpvoted(prev.userHasUpvoted);
      setUpvoteCount(prev.upvoteCount);
    } finally {
      setVoting(false);
    }
  }

  async function handleDownvote() {
    if (voting) return;
    const prev = { downvoteCount, userHasDownvoted };
    setUserHasDownvoted(!userHasDownvoted);
    setDownvoteCount((c) => (userHasDownvoted ? c - 1 : c + 1));
    if (userHasUpvoted) {
      setUserHasUpvoted(false);
      setUpvoteCount((c) => c - 1);
    }
    setVoting(true);
    try {
      const res = await toggleReplyDownvote(postId, reply.id);
      setUserHasDownvoted(res.voted);
      setDownvoteCount(res.downvoteCount);
      setUpvoteCount(res.upvoteCount);
      setUserHasUpvoted(false);
    } catch {
      setUserHasDownvoted(prev.userHasDownvoted);
      setDownvoteCount(prev.downvoteCount);
    } finally {
      setVoting(false);
    }
  }

  return (
    <div className={`flex ${depth > 0 ? "mt-3" : ""}`}>
      {/* Depth line — clickable rail, shifts hue with depth */}
      {depth > 0 && (
        <div className="mr-3 shrink-0 flex justify-center" style={{ width: 12 }}>
          <div className={`w-px h-full border-l transition-colors cursor-pointer ${depthLineClass}`} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        {/* Author row */}
        <div className="mb-1 flex items-center gap-2">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-[9px] font-semibold text-hub-text-secondary">
            {getInitials(reply.authorDisplayName)}
          </div>
          <span className="text-[11px] font-semibold text-hub-text-secondary tracking-wide">
            {reply.authorDisplayName}
          </span>
          <span className="text-[11px] text-hub-text-muted/60">{timeAgo(reply.createdAt)}</span>
        </div>

        {/* Body — full opacity, no wrapping surface */}
        <div className="mb-1.5 pl-0">
          <MarkdownBody>{reply.body}</MarkdownBody>
        </div>

        {/* Action bar — whisper quiet */}
        <div className="flex items-center gap-0.5 mb-0.5">
          <button
            type="button"
            onClick={handleUpvote}
            disabled={voting}
            aria-label="Upvote"
            className={`flex h-5 w-5 items-center justify-center rounded transition-colors disabled:opacity-40 ${
              userHasUpvoted ? "text-hub-cyan" : "text-hub-text-muted/50 hover:text-hub-cyan"
            }`}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <span
            className={`w-6 text-center text-[11px] font-medium tabular-nums ${
              score > 0 ? "text-hub-cyan" : score < 0 ? "text-hub-danger" : "text-hub-text-muted/60"
            }`}
          >
            {score}
          </span>
          <button
            type="button"
            onClick={handleDownvote}
            disabled={voting}
            aria-label="Downvote"
            className={`flex h-5 w-5 items-center justify-center rounded transition-colors disabled:opacity-40 ${
              userHasDownvoted ? "text-hub-danger" : "text-hub-text-muted/50 hover:text-hub-danger"
            }`}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setShowReplyComposer((v) => !v)}
            className="ml-1 text-[11px] font-medium text-hub-text-muted/50 transition-colors hover:text-hub-cyan px-1.5 py-0.5 rounded"
          >
            Reply
          </button>
        </div>

        {/* Inline reply composer */}
        {showReplyComposer && (
          <div className="mt-2 mb-1">
            <ReplyComposer
              postId={postId}
              parentReplyId={reply.id}
              onSubmitted={onRepliesUpdated}
              onCancel={() => setShowReplyComposer(false)}
              startExpanded
            />
          </div>
        )}

        {/* Child replies — no gap wrapper, just spacing via mt on each node */}
        {children.length > 0 && (
          <div className="mt-1">
            {children.map((child) => (
              <ReplyNode
                key={child.id}
                reply={child}
                postId={postId}
                depth={depth + 1}
                children={allReplies.filter((r) => r.parentReplyId === child.id)}
                allReplies={allReplies}
                onRepliesUpdated={onRepliesUpdated}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
