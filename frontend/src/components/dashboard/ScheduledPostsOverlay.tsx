"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Tag,
  Users,
  X,
} from "lucide-react";
import { getPost, listPosts, togglePostDownvote, toggleUpvote } from "@/lib/api/community";
import { timeAgo, getInitials } from "@/lib/community/utils";
import { ReplyComposer } from "@/components/community/ReplyComposer";
import type { ClassDossier } from "@/types/dossier";
import type { PostDetail, PostSummary, ReplyOut, SortBy } from "@/types/community";

// ---------------------------------------------------------------------------
// General-tag color map
// ---------------------------------------------------------------------------

const GENERAL_TAG_COLORS: Record<string, string> = {
  General: "bg-white/[0.08] text-hub-text-secondary",
  Classes: "bg-hub-cyan/10 text-hub-cyan",
  Advice: "bg-hub-gold/10 text-hub-gold",
};

// ---------------------------------------------------------------------------
// Upvote burst — portalled so no parent overflow clips the particles
// ---------------------------------------------------------------------------

type Particle = { id: number; x: number; peakY: number; fallY: number; rotate: number };

function UpvoteBurst({
  trigger,
  originRef,
}: {
  trigger: number;
  originRef: React.RefObject<HTMLButtonElement | null>;
}) {
  // Snapshot the button's screen position at the moment of each trigger
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
        const peakY = -(36 + Math.random() * 50); // 30% taller peak
        return {
          id: i,
          x: (Math.random() - 0.5) * 68,          // 30% wider spread
          peakY,
          // after peak: fall past origin by ~50px (feels like gravity)
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
          // particles start dead-centre on the button then diverge
          initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
          animate={{
            x:       [0, p.x * 0.55, p.x],
            // 0 → peak (up) → fallY (drops below origin, simulating gravity)
            y:       [0, p.peakY, p.fallY],
            opacity: [1, 0.85, 0],
            scale:   [0.9, 1.4, 0.25],   // 30% bigger at peak
            rotate:  [0, p.rotate * 0.55, p.rotate],
          }}
          transition={{
            duration: 0.72,              // +0.1 s
            times:    [0, 0.40, 1],      // peak slightly earlier → longer fall
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
// Vote buttons — standalone, doesn't trigger card expand
// ---------------------------------------------------------------------------

type VoteState = {
  upvoteCount: number;
  downvoteCount: number;
  userHasUpvoted: boolean;
  userHasDownvoted: boolean;
};

function VoteButtons({
  postId,
  initial,
}: {
  postId: string;
  initial: VoteState;
}) {
  const [state, setState] = useState(initial);
  const [voting, setVoting] = useState(false);
  const [burstTrigger, setBurstTrigger] = useState(0);
  const upvoteBtnRef = useRef<HTMLButtonElement>(null);
  const score = state.upvoteCount - state.downvoteCount;

  async function handleUpvote(e: React.MouseEvent) {
    e.stopPropagation();
    if (voting) return;
    const prev = { ...state };
    const nowUpvoted = !state.userHasUpvoted;
    setState((s) => ({
      userHasUpvoted: nowUpvoted,
      upvoteCount: s.upvoteCount + (nowUpvoted ? 1 : -1),
      userHasDownvoted: nowUpvoted ? false : s.userHasDownvoted,
      downvoteCount: nowUpvoted && s.userHasDownvoted ? s.downvoteCount - 1 : s.downvoteCount,
    }));
    if (nowUpvoted) setBurstTrigger((n) => n + 1);
    setVoting(true);
    try {
      const res = await toggleUpvote(postId);
      setState((s) => ({ ...s, userHasUpvoted: res.upvoted, upvoteCount: res.upvoteCount }));
    } catch {
      setState(prev);
    } finally {
      setVoting(false);
    }
  }

  async function handleDownvote(e: React.MouseEvent) {
    e.stopPropagation();
    if (voting) return;
    const prev = { ...state };
    const nowDownvoted = !state.userHasDownvoted;
    setState((s) => ({
      userHasDownvoted: nowDownvoted,
      downvoteCount: s.downvoteCount + (nowDownvoted ? 1 : -1),
      userHasUpvoted: nowDownvoted ? false : s.userHasUpvoted,
      upvoteCount: nowDownvoted && s.userHasUpvoted ? s.upvoteCount - 1 : s.upvoteCount,
    }));
    setVoting(true);
    try {
      const res = await togglePostDownvote(postId);
      setState((s) => ({ ...s, userHasDownvoted: res.voted, downvoteCount: res.downvoteCount, upvoteCount: res.upvoteCount }));
    } catch {
      setState(prev);
    } finally {
      setVoting(false);
    }
  }

  return (
    <div
      className="relative flex shrink-0 flex-col items-center rounded-lg border border-white/[0.07] bg-white/[0.04] py-1"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Upvote button — ref tracked so burst portal knows where to spawn */}
      <UpvoteBurst trigger={burstTrigger} originRef={upvoteBtnRef} />
      <button
        ref={upvoteBtnRef}
        type="button"
        onClick={handleUpvote}
        disabled={voting}
        aria-label="Upvote"
        className={`flex h-6 w-7 items-center justify-center rounded transition-all duration-100 active:scale-90 disabled:opacity-50 ${
          state.userHasUpvoted
            ? "text-hub-cyan"
            : "text-white/30 hover:text-hub-cyan"
        }`}
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>

      {/* Score with AnimatePresence for number morph */}
      <AnimatePresence mode="popLayout">
        <motion.span
          key={score}
          initial={{ opacity: 0, y: -6, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.8 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className={`min-w-[1.5rem] text-center text-[11px] font-semibold tabular-nums ${
            score > 0 ? "text-hub-cyan" : score < 0 ? "text-hub-danger" : "text-white/40"
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
        className={`flex h-6 w-7 items-center justify-center rounded transition-all duration-100 active:scale-90 disabled:opacity-50 ${
          state.userHasDownvoted
            ? "text-hub-danger"
            : "text-white/30 hover:text-hub-danger"
        }`}
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function Skeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.03] p-5"
        >
          <div className="mb-3 flex gap-2">
            <div className="h-4 w-16 rounded-full bg-white/[0.08]" />
            <div className="h-4 w-20 rounded-full bg-white/[0.08]" />
          </div>
          <div className="mb-2 h-4 w-3/4 rounded bg-white/[0.07]" />
          <div className="h-3 w-1/2 rounded bg-white/[0.05]" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reply item
// ---------------------------------------------------------------------------

function ReplyItem({ reply }: { reply: ReplyOut }) {
  return (
    <div className="flex gap-3 py-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.10] text-[10px] font-semibold text-white/60">
        {getInitials(reply.isAnonymous ? "Anon" : reply.authorDisplayName)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="text-[11px] font-semibold text-white/80">
            {reply.isAnonymous ? "Anonymous" : reply.authorDisplayName}
          </span>
          <span className="text-[11px] text-white/35">{timeAgo(reply.createdAt)}</span>
        </div>
        <p className="text-[12.5px] leading-relaxed text-white/65">{reply.body}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single post card
// ---------------------------------------------------------------------------

type PostCardProps = {
  post: PostSummary;
  isExpanded: boolean;
  isDimmed: boolean;
  detail: PostDetail | null;
  loadingDetail: boolean;
  onToggle: () => void;
  onRepliesUpdate: (replies: ReplyOut[]) => void;
};

function OverlayPostCard({
  post,
  isExpanded,
  isDimmed,
  detail,
  loadingDetail,
  onToggle,
  onRepliesUpdate,
}: PostCardProps) {
  const replies = detail?.replies ?? [];

  return (
    <motion.div
      layout
      className={`overflow-hidden rounded-xl border transition-colors duration-200 ${
        isExpanded
          ? "border-hub-cyan/25 bg-hub-surface-elevated/70"
          : "border-white/[0.08] bg-white/[0.03] hover:border-white/[0.14]"
      } ${isDimmed ? "opacity-45" : "opacity-100"}`}
    >
      {/* ── Card header ── */}
      <div className="flex items-start gap-3 p-4">
        {/* Vote column — does NOT trigger expand */}
        <VoteButtons
          postId={post.id}
          initial={{
            upvoteCount: post.upvoteCount,
            downvoteCount: post.downvoteCount,
            userHasUpvoted: post.userHasUpvoted,
            userHasDownvoted: post.userHasDownvoted,
          }}
        />

        {/* Content column */}
        <div className="min-w-0 flex-1">
          {/* Top row: course:prof (left) + general tags + chevron (right) */}
          <div className="mb-1.5 flex items-center gap-1.5">
            {(post.courseCode || post.professorName) && (
              <span className="inline-flex items-center gap-1 rounded-md bg-hub-cyan/10 px-2 py-0.5 text-xs font-medium text-hub-cyan">
                <Tag className="h-3 w-3 shrink-0" />
                {post.courseCode}
                {post.professorName && (
                  <span className="text-hub-cyan/60">: {post.professorName}</span>
                )}
              </span>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              {post.generalTags?.map((tag) => (
                <span
                  key={tag}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${GENERAL_TAG_COLORS[tag] ?? "bg-white/[0.06] text-hub-text-muted"}`}
                >
                  {tag}
                </span>
              ))}
              <motion.button
                type="button"
                onClick={onToggle}
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="shrink-0 text-white/30 transition hover:text-white/60 active:scale-90"
              >
                <ChevronDown className="h-4 w-4" />
              </motion.button>
            </div>
          </div>

          {/* Title + meta — clicking expands */}
          <button
            type="button"
            onClick={onToggle}
            className="w-full text-left"
          >
            <h3 className="mb-1 font-semibold leading-snug text-white/90">{post.title}</h3>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/40">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-hub-cyan/15 text-[9px] font-bold text-hub-cyan">
                {getInitials(post.isAnonymous ? "Anon" : post.authorDisplayName)}
              </div>
              <span>{post.isAnonymous ? "Anonymous" : post.authorDisplayName}</span>
              <span>·</span>
              <span>{timeAgo(post.createdAt)}</span>
              <span className="ml-auto flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {detail ? detail.replies.length : post.replyCount}
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* ── Expanded body ── */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.06] px-4 pb-4 pt-3">
              <p className="text-[13px] leading-relaxed text-white/70">{post.body}</p>

              {/* Replies */}
              {loadingDetail ? (
                <div className="mt-4 space-y-3">
                  {[0, 1].map((i) => (
                    <div key={i} className="flex gap-3 animate-pulse">
                      <div className="h-6 w-6 rounded-full bg-white/[0.08]" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-24 rounded bg-white/[0.08]" />
                        <div className="h-3 w-3/4 rounded bg-white/[0.06]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : replies.length > 0 ? (
                <div className="mt-3 border-t border-white/[0.06]">
                  <p className="mb-1 mt-2 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                    Replies ({replies.length})
                  </p>
                  <div className="divide-y divide-white/[0.05]">
                    {replies.slice(0, 5).map((r) => (
                      <ReplyItem key={r.id} reply={r} />
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Reply composer */}
              <div className="mt-4">
                <ReplyComposer
                  postId={post.id}
                  onSubmitted={onRepliesUpdate}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main overlay
// ---------------------------------------------------------------------------

type Props = {
  classes: ClassDossier[];
  onClose: () => void;
};

export function ScheduledPostsOverlay({ classes, onClose }: Props) {
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, PostDetail>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const detailCacheRef = useRef(detailCache);
  detailCacheRef.current = detailCache;

  const courseCodes = useMemo(
    () => [...new Set(classes.map((c) => c.courseCode).filter(Boolean))] as string[],
    [classes],
  );

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled(
        courseCodes.map((code) => listPosts({ courseCode: code })),
      );
      const merged = new Map<string, PostSummary>();
      for (const r of results) {
        if (r.status === "fulfilled") {
          for (const p of r.value.posts) merged.set(p.id, p);
        }
      }
      setPosts([...merged.values()]);
    } catch {
      setError("Failed to load posts. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [courseCodes]);

  useEffect(() => { void fetchPosts(); }, [fetchPosts]);

  // Pre-fetch details for the first few posts so replies are ready instantly
  useEffect(() => {
    if (posts.length === 0) return;
    for (const post of posts.slice(0, 4)) {
      if (!detailCacheRef.current[post.id]) {
        getPost(post.id)
          .then((detail) => setDetailCache((prev) => ({ ...prev, [post.id]: detail })))
          .catch(() => {});
      }
    }
  }, [posts]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sortedPosts = useMemo(() => {
    const copy = [...posts];
    if (sortBy === "best") {
      return copy.sort((a, b) => (b.upvoteCount - b.downvoteCount) - (a.upvoteCount - a.downvoteCount));
    }
    return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [posts, sortBy]);

  async function handleToggle(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!detailCache[id]) {
      setLoadingDetail(true);
      try {
        const detail = await getPost(id);
        setDetailCache((prev) => ({ ...prev, [id]: detail }));
      } catch { /* body still visible */ }
      finally { setLoadingDetail(false); }
    }
  }

  function handleRepliesUpdate(postId: string, replies: ReplyOut[]) {
    setDetailCache((prev) => {
      const existing = prev[postId];
      if (!existing) return prev;
      return { ...prev, [postId]: { ...existing, replies } };
    });
  }

  return (
    <motion.div
      key="community-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[80] flex items-stretch justify-center"
      onClick={onClose}
    >
      {/* Backdrop — starts at left-14 so sidebar rail stays visible */}
      <div className="absolute inset-0 left-14 bg-black/60 backdrop-blur-sm" />

      {/* Slide-in panel */}
      <motion.div
        ref={panelRef}
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 40 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 ml-auto flex h-full w-full max-w-2xl flex-col border-l border-white/[0.08]"
        style={{
          background: "rgba(10, 25, 47, 0.97)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        {/* ── Header ── */}
        <div className="flex flex-col gap-3 border-b border-white/[0.07] px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Users className="h-4 w-4 text-hub-cyan" />
              <h2 className="font-[family-name:var(--font-outfit)] text-sm font-bold tracking-wide text-white/90">
                Tagged Posts
              </h2>
              {!loading && (
                <motion.span
                  key={posts.length}
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", duration: 0.35, bounce: 0.3 }}
                  className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-medium text-white/50"
                >
                  {posts.length}
                </motion.span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* Sort pills */}
              <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] p-0.5">
                {(["newest", "best"] as SortBy[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSortBy(s)}
                    className={`rounded-md px-3 py-1 text-[11px] font-medium capitalize transition-all duration-150 active:scale-95 ${
                      sortBy === s
                        ? "bg-hub-cyan/15 text-hub-cyan"
                        : "text-white/40 hover:text-white/65"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] text-white/40 transition hover:border-white/[0.16] hover:text-white/75 active:scale-90"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Course code pills */}
          <div className="flex flex-wrap gap-1.5">
            {courseCodes.map((code, i) => (
              <motion.span
                key={code}
                initial={{ opacity: 0, scale: 0.85, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="inline-flex items-center gap-1 rounded-md border border-hub-cyan/20 bg-hub-cyan/[0.07] px-2.5 py-0.5 text-[11px] font-medium text-hub-cyan/80"
              >
                <Tag className="h-2.5 w-2.5" />
                {code}
              </motion.span>
            ))}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto hub-scroll px-6 py-4">
          {loading ? (
            <Skeleton />
          ) : error ? (
            <div className="rounded-xl border border-hub-danger/25 bg-hub-danger/[0.07] p-5 text-center">
              <p className="text-sm text-hub-danger">{error}</p>
              <button
                type="button"
                onClick={() => void fetchPosts()}
                className="mt-3 rounded-lg border border-hub-danger/25 px-4 py-1.5 text-xs font-medium text-hub-danger transition hover:bg-hub-danger/10 active:scale-[0.97]"
              >
                Retry
              </button>
            </div>
          ) : sortedPosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <MessageSquare className="mb-3 h-8 w-8 text-white/15" />
              <p className="text-sm font-medium text-white/40">No community posts for your courses yet</p>
              <p className="mt-1 text-xs text-white/25">Be the first to start a discussion</p>
            </div>
          ) : (
            <motion.div className="space-y-2.5" layout>
              {sortedPosts.map((post, i) => (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                  <OverlayPostCard
                    post={post}
                    isExpanded={expandedId === post.id}
                    isDimmed={expandedId !== null && expandedId !== post.id}
                    detail={detailCache[post.id] ?? null}
                    loadingDetail={loadingDetail && expandedId === post.id}
                    onToggle={() => void handleToggle(post.id)}
                    onRepliesUpdate={(replies) => handleRepliesUpdate(post.id, replies)}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
