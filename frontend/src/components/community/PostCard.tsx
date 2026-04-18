"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronUp, ChevronDown, MessageSquare, Tag } from "lucide-react";
import { toggleUpvote, togglePostDownvote } from "@/lib/api/community";
import { timeAgo, getInitials } from "@/lib/community/utils";
import type { PostSummary } from "@/types/community";

const GENERAL_TAG_COLORS: Record<string, string> = {
  General: "bg-white/[0.08] text-hub-text-secondary",
  Classes: "bg-hub-cyan/10 text-hub-cyan",
  Advice: "bg-hub-gold/10 text-hub-gold",
};

// ---------------------------------------------------------------------------
// Upvote burst — portalled to document.body so overflow-hidden never clips
// ---------------------------------------------------------------------------

type Particle = { id: number; x: number; peakY: number; fallY: number; rotate: number };

function UpvoteBurst({
  trigger,
  originRef,
}: {
  trigger: number;
  originRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (trigger > 0 && originRef.current) {
      const r = originRef.current.getBoundingClientRect();
      setOrigin({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const peakY = -(36 + Math.random() * 50);
        return {
          id: i,
          x: (Math.random() - 0.5) * 68,
          peakY,
          fallY: Math.abs(peakY) * 0.25 + 50,
          rotate: (Math.random() - 0.5) * 100,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trigger],
  );

  if (trigger === 0 || !origin) return null;

  return createPortal(
    <>
      {particles.map((p) => (
        <motion.span
          key={`${trigger}-${p.id}`}
          aria-hidden
          className="pointer-events-none fixed select-none text-hub-cyan"
          style={{ left: origin.x, top: origin.y, fontSize: 13, zIndex: 9999 }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
          animate={{
            x:       [0, p.x * 0.55, p.x],
            y:       [0, p.peakY, p.fallY],
            opacity: [1, 0.85, 0],
            scale:   [0.9, 1.4, 0.25],
            rotate:  [0, p.rotate * 0.55, p.rotate],
          }}
          transition={{
            duration: 0.72,
            times:    [0, 0.40, 1],
            ease:     ["easeOut", "easeIn"],
          }}
        >
          ↑
        </motion.span>
      ))}
    </>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// PostCard
// ---------------------------------------------------------------------------

type PostCardProps = { post: PostSummary };

export function PostCard({ post }: PostCardProps) {
  const [upvoteCount, setUpvoteCount] = useState(post.upvoteCount);
  const [downvoteCount, setDownvoteCount] = useState(post.downvoteCount);
  const [userHasUpvoted, setUserHasUpvoted] = useState(post.userHasUpvoted);
  const [userHasDownvoted, setUserHasDownvoted] = useState(post.userHasDownvoted);
  const [voting, setVoting] = useState(false);
  const [burstTrigger, setBurstTrigger] = useState(0);
  const upvoteBtnRef = useRef<HTMLButtonElement>(null);

  const score = upvoteCount - downvoteCount;

  async function handleUpvote(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (voting) return;
    const prev = { upvoteCount, userHasUpvoted, downvoteCount, userHasDownvoted };
    const nowUpvoted = !userHasUpvoted;
    setUserHasUpvoted(nowUpvoted);
    setUpvoteCount((c) => c + (nowUpvoted ? 1 : -1));
    if (userHasDownvoted && nowUpvoted) { setUserHasDownvoted(false); setDownvoteCount((c) => c - 1); }
    if (nowUpvoted) setBurstTrigger((n) => n + 1);
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
    } finally { setVoting(false); }
  }

  async function handleDownvote(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (voting) return;
    const prev = { upvoteCount, userHasUpvoted, downvoteCount, userHasDownvoted };
    const nowDownvoted = !userHasDownvoted;
    setUserHasDownvoted(nowDownvoted);
    setDownvoteCount((c) => c + (nowDownvoted ? 1 : -1));
    if (userHasUpvoted && nowDownvoted) { setUserHasUpvoted(false); setUpvoteCount((c) => c - 1); }
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
    } finally { setVoting(false); }
  }

  return (
    <Link
      href={`/community/${post.id}`}
      className="glass-panel group relative block overflow-hidden rounded-xl border border-white/[0.08] p-5 transition-all duration-200 hover:border-hub-cyan/30 hover:bg-hub-surface-elevated/60 hover:shadow-[0_4px_24px_rgba(0,212,255,0.06)] before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-transparent before:transition hover:before:bg-hub-cyan"
    >
      <div className="min-w-0 flex-1">
        {/* Tags row */}
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
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

        <h3 className="mb-1 line-clamp-1 font-semibold text-hub-text">{post.title}</h3>
        <p className="line-clamp-2 text-sm text-hub-text-secondary">{post.body}</p>
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
          {/* Vote: ▲ score ▼ */}
          <div className="flex items-center gap-0.5 rounded-full bg-white/[0.06] px-1 py-0.5">
            {/* Upvote with burst */}
            <UpvoteBurst trigger={burstTrigger} originRef={upvoteBtnRef} />
            <button
              ref={upvoteBtnRef}
              type="button"
              onClick={handleUpvote}
              disabled={voting}
              aria-label="Upvote"
              className={`flex h-5 w-5 items-center justify-center rounded-full transition-all duration-100 active:scale-75 disabled:opacity-50 ${
                userHasUpvoted ? "text-hub-cyan" : "text-hub-text-muted hover:text-hub-cyan"
              }`}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>

            {/* Animated score */}
            <AnimatePresence mode="popLayout">
              <motion.span
                key={score}
                initial={{ opacity: 0, y: -5, scale: 0.75 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 5, scale: 0.75 }}
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                className={`min-w-[1.25rem] text-center text-xs tabular-nums ${
                  score > 0 ? "text-hub-cyan" : score < 0 ? "text-hub-danger" : "text-hub-text-muted"
                }`}
              >
                {score}
              </motion.span>
            </AnimatePresence>

            <button
              type="button"
              onClick={handleDownvote}
              disabled={voting}
              aria-label="Downvote"
              className={`flex h-5 w-5 items-center justify-center rounded-full transition-all duration-100 active:scale-75 disabled:opacity-50 ${
                userHasDownvoted ? "text-hub-danger" : "text-hub-text-muted hover:text-hub-danger"
              }`}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>

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
