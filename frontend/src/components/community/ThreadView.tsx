"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Tag } from "lucide-react";
import { createReply } from "@/lib/api/community";
import type { PostDetail, ReplyOut } from "@/types/community";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type ThreadViewProps = {
  post: PostDetail;
};

export function ThreadView({ post }: ThreadViewProps) {
  const [replies, setReplies] = useState<ReplyOut[]>(post.replies);
  const [replyBody, setReplyBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/community"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-hub-text-muted transition hover:text-hub-cyan"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Community
      </Link>

      {/* Original post */}
      <div className="glass-panel mb-6 rounded-xl border border-white/[0.08] p-6">
        {post.courseCode && (
          <span className="mb-3 inline-flex items-center gap-1 rounded-md bg-hub-cyan/10 px-2 py-0.5 text-xs font-medium text-hub-cyan">
            <Tag className="h-3 w-3" />
            {post.courseCode}
          </span>
        )}
        <h1 className="mb-2 text-xl font-bold text-hub-text">{post.title}</h1>
        <p className="whitespace-pre-wrap text-sm text-hub-text-secondary">
          {post.body}
        </p>
        <div className="mt-4 flex items-center gap-2 text-xs text-hub-text-muted">
          <span>{post.authorDisplayName}</span>
          <span>·</span>
          <span>{timeAgo(post.createdAt)}</span>
        </div>
      </div>

      {/* Replies */}
      <h2 className="mb-3 text-sm font-semibold text-hub-text-secondary">
        {replies.length} {replies.length === 1 ? "Reply" : "Replies"}
      </h2>

      <div className="mb-6 flex flex-col gap-3">
        {replies.map((reply) => (
          <div
            key={reply.id}
            className="glass-panel rounded-xl border border-white/[0.08] p-4"
          >
            <p className="whitespace-pre-wrap text-sm text-hub-text-secondary">
              {reply.body}
            </p>
            <div className="mt-2 flex items-center gap-2 text-xs text-hub-text-muted">
              <span>{reply.authorDisplayName}</span>
              <span>·</span>
              <span>{timeAgo(reply.createdAt)}</span>
            </div>
          </div>
        ))}
        {replies.length === 0 && (
          <p className="py-4 text-center text-sm text-hub-text-muted">
            No replies yet. Be the first to respond!
          </p>
        )}
      </div>

      {/* Reply form */}
      <div className="glass-panel rounded-xl border border-white/[0.08] p-5">
        <h3 className="mb-3 text-sm font-semibold text-hub-text">
          Add a Reply
        </h3>
        <form onSubmit={handleReply} className="flex flex-col gap-3">
          <textarea
            required
            rows={4}
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Write your reply…"
            className="w-full resize-none rounded-lg border border-white/[0.08] bg-hub-bg/80 px-3 py-2.5 text-sm text-hub-text outline-none ring-hub-cyan/40 placeholder:text-hub-text-muted focus:border-hub-cyan/40 focus:ring-2"
          />
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
