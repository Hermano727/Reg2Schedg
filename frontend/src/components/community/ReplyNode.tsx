"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronUp, ChevronDown, MoreHorizontal, Download, Flag, FileText, Pencil, Trash2, Bookmark, Check } from "lucide-react";
import { toggleReplyUpvote, toggleReplyDownvote, deleteReply, editReply, saveAttachmentToVault } from "@/lib/api/community";
import { timeAgo, getInitials } from "@/lib/community/utils";
import { MarkdownBody } from "./MarkdownBody";
import { ReplyComposer } from "./ReplyComposer";
import { ImageLightbox } from "./ImageLightbox";
import type { PostAttachment, ReplyOut } from "@/types/community";

function AttachmentCard({
  att, postId, postTitle, replyId, replyPreview,
}: {
  att: PostAttachment;
  postId: string;
  postTitle: string;
  replyId: string;
  replyPreview: string;
}) {
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

  const isImage = att.mimeType.startsWith("image/");

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
      await saveAttachmentToVault({ attachment: att, postId, postTitle, replyId, replyPreview });
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
          <button
            type="button"
            onClick={handleDownload}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-hub-text-secondary hover:bg-white/[0.06] transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Download file
          </button>
          <button
            type="button"
            onClick={handleSaveToVault}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-hub-text-secondary hover:bg-white/[0.06] transition-colors"
          >
            {saved ? <Check className="h-3.5 w-3.5 text-hub-success" /> : <Bookmark className="h-3.5 w-3.5" />}
            {saved ? "Saved!" : "Save to vault"}
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-hub-text-muted hover:bg-white/[0.06] transition-colors"
          >
            <Flag className="h-3.5 w-3.5" />
            Report
          </button>
        </div>
      )}
    </div>
  );

  if (isImage && att.signedUrl) {
    return (
      <>
        <div
          className="group relative inline-block overflow-hidden rounded-lg border border-white/[0.08] cursor-zoom-in transition-all duration-200 hover:border-hub-cyan/30 hover:shadow-[0_0_12px_rgba(0,212,255,0.15)]"
          onClick={() => setLightboxOpen(true)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={att.signedUrl}
            alt={att.name}
            className="block max-h-64 max-w-xs object-contain transition-transform duration-200 group-hover:scale-[1.02]"
          />
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
      <span className="max-w-[160px] truncate text-[12px] text-hub-text-secondary">{att.name}</span>
      <div className="ml-1">{menu}</div>
    </div>
  );
}

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
  postTitle: string;
  depth: number;
  children: ReplyOut[];
  allReplies: ReplyOut[];
  onRepliesUpdated: (replies: ReplyOut[]) => void;
  currentUserId: string | null;
  onDeleted: (replyId: string) => void;
};

export function ReplyNode({
  reply,
  postId,
  postTitle,
  depth,
  children,
  allReplies,
  onRepliesUpdated,
  currentUserId,
  onDeleted,
}: ReplyNodeProps) {
  const [upvoteCount, setUpvoteCount] = useState(reply.upvoteCount);
  const [downvoteCount, setDownvoteCount] = useState(reply.downvoteCount);
  const [userHasUpvoted, setUserHasUpvoted] = useState(reply.userHasUpvoted);
  const [userHasDownvoted, setUserHasDownvoted] = useState(reply.userHasDownvoted);
  const [voting, setVoting] = useState(false);
  const [showReplyComposer, setShowReplyComposer] = useState(false);
  const [ownerMenuOpen, setOwnerMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(reply.body);
  const [saving, setSaving] = useState(false);
  const ownerMenuRef = useRef<HTMLDivElement>(null);

  const isOwner = !!currentUserId && reply.userId === currentUserId;

  useEffect(() => {
    if (!ownerMenuOpen) return;
    function close(e: MouseEvent) {
      if (ownerMenuRef.current && !ownerMenuRef.current.contains(e.target as Node)) {
        setOwnerMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [ownerMenuOpen]);

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteReply(postId, reply.id);
      onDeleted(reply.id);
    } catch {
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  async function handleSaveEdit() {
    if (!editBody.trim() || saving) return;
    setSaving(true);
    try {
      const updated = await editReply(postId, reply.id, editBody.trim());
      onRepliesUpdated(updated.replies);
      setIsEditing(false);
    } catch {
      // keep editor open on error
    } finally {
      setSaving(false);
    }
  }

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
    <div id={`reply-${reply.id}`} className={`flex ${depth > 0 ? "mt-3" : ""}`}>
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

        {/* Deleted placeholder — keeps the thread chain intact */}
        {reply.isDeleted ? (
          <p className="mb-1.5 text-sm italic text-hub-text-muted/60">
            This comment has been deleted.
          </p>
        ) : isEditing ? (
          <div className="mb-2">
            <textarea
              autoFocus
              rows={3}
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              className="w-full resize-none rounded-md border border-white/[0.12] bg-hub-surface px-3 py-2 text-sm text-hub-text outline-none focus:border-hub-cyan/30"
            />
            <div className="mt-1.5 flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={saving || !editBody.trim()}
                className="h-6 rounded px-3 text-[11px] font-semibold bg-hub-cyan text-hub-bg transition-all hover:brightness-110 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => { setIsEditing(false); setEditBody(reply.body); }}
                className="h-6 px-2.5 text-[11px] text-hub-text-muted/70 transition-colors hover:text-hub-text-muted rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mb-1.5 pl-0">
            <MarkdownBody>{reply.body}</MarkdownBody>
            {reply.editedAt && (
              <span className="text-[10px] text-hub-text-muted/50 italic"> (edited)</span>
            )}
          </div>
        )}

        {/* Attachments */}
        {!isEditing && !reply.isDeleted && reply.attachments && reply.attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {reply.attachments.map((att) => (
              <AttachmentCard
                key={att.id}
                att={att}
                postId={postId}
                postTitle={postTitle}
                replyId={reply.id}
                replyPreview={reply.body.slice(0, 200)}
              />
            ))}
          </div>
        )}

        {/* Action bar + confirmation — hidden for deleted replies */}
        {!reply.isDeleted && (
          <>
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

              {isOwner && !isEditing && (
                <div ref={ownerMenuRef} className="relative ml-1">
                  <button
                    type="button"
                    onClick={() => { setOwnerMenuOpen((v) => !v); setConfirmDelete(false); }}
                    className="flex h-5 w-5 items-center justify-center rounded text-hub-text-muted/40 transition-colors hover:text-hub-text-muted"
                    title="More options"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>

                  {ownerMenuOpen && !confirmDelete && (
                    <div className="absolute left-0 top-6 z-50 min-w-[120px] rounded-lg border border-white/[0.1] bg-hub-surface-elevated shadow-xl py-1">
                      <button
                        type="button"
                        onClick={() => { setIsEditing(true); setEditBody(reply.body); setOwnerMenuOpen(false); }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-hub-text-secondary hover:bg-white/[0.06] transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-hub-danger hover:bg-hub-danger/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Inline delete confirmation */}
            {confirmDelete && (
              <div className="mb-1 flex items-center gap-2 rounded-md border border-hub-danger/20 bg-hub-danger/5 px-3 py-2">
                <span className="flex-1 text-[12px] text-hub-text-muted">Delete this comment?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="h-6 rounded px-3 text-[11px] font-semibold bg-hub-danger text-white transition-all hover:brightness-110 disabled:opacity-40"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirmDelete(false); setOwnerMenuOpen(false); }}
                  className="h-6 px-2 text-[11px] text-hub-text-muted/70 hover:text-hub-text-muted rounded"
                >
                  Cancel
                </button>
              </div>
            )}
          </>
        )}

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
                postTitle={postTitle}
                depth={depth + 1}
                children={allReplies.filter((r) => r.parentReplyId === child.id)}
                allReplies={allReplies}
                onRepliesUpdated={onRepliesUpdated}
                currentUserId={currentUserId}
                onDeleted={onDeleted}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
