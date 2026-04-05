"use client";

import Link from "next/link";
import { MessageSquare, Tag } from "lucide-react";
import type { PostSummary } from "@/types/community";

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

type PostCardProps = {
  post: PostSummary;
};

export function PostCard({ post }: PostCardProps) {
  return (
    <Link
      href={`/community/${post.id}`}
      className="glass-panel block rounded-xl border border-white/[0.08] p-5 transition hover:border-hub-cyan/30 hover:bg-hub-surface-elevated/60"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {post.courseCode && (
              <span className="inline-flex items-center gap-1 rounded-md bg-hub-cyan/10 px-2 py-0.5 text-xs font-medium text-hub-cyan">
                <Tag className="h-3 w-3" />
                {post.courseCode}
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
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-hub-text-muted">
        <span>{post.authorDisplayName}</span>
        <span>·</span>
        <span>{timeAgo(post.createdAt)}</span>
        <span className="ml-auto flex items-center gap-1">
          <MessageSquare className="h-3.5 w-3.5" />
          {post.replyCount}
        </span>
      </div>
    </Link>
  );
}
