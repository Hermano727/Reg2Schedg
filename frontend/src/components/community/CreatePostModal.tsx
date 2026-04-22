"use client";

import { cloneElement, isValidElement, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Image as ImageIcon, Paperclip, X } from "lucide-react";
import { createPost } from "@/lib/api/community";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/storage";
import type { PostSummary } from "@/types/community";

const GENERAL_TAGS = ["General", "Classes", "Advice"] as const;
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 10 * 1_000_000;

type AttachmentState = {
  file: File;
  preview: string;
  path: string | null;
  uploading: boolean;
  error: string | null;
};

type CreatePostModalProps = {
  trigger?: React.ReactNode;
  onCreated: (post: PostSummary) => void;
  userId?: string;
  initialCourseCode?: string;
  initialProfessorName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function CreatePostModal({
  trigger,
  onCreated,
  userId,
  initialCourseCode,
  initialProfessorName,
  open,
  onOpenChange,
}: CreatePostModalProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [professorName, setProfessorName] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [generalTags, setGeneralTags] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<AttachmentState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const dialogIdBase = userId
    ? `create-post-dialog-${userId}`
    : "create-post-dialog";
  const dialogTriggerId = `${dialogIdBase}-trigger`;
  const dialogContentId = `${dialogIdBase}-content`;
  const triggerElement = trigger && isValidElement(trigger)
    ? cloneElement(trigger as React.ReactElement<Record<string, unknown>>, {
        id: dialogTriggerId,
        "aria-controls": dialogContentId,
      })
    : trigger;

  function setOpen(nextOpen: boolean) {
    if (!isControlled) {
      setInternalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
    if (!nextOpen) reset();
  }

  // Seed pre-filled values when opened from an external context (e.g. ClassLookupModal)
  useEffect(() => {
    if (isOpen) {
      if (initialCourseCode) setCourseCode(initialCourseCode);
      if (initialProfessorName) setProfessorName(initialProfessorName);
    }
  }, [isOpen, initialCourseCode, initialProfessorName]);

  function toggleGeneralTag(tag: string) {
    setGeneralTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  function reset() {
    setTitle("");
    setBody("");
    setCourseCode("");
    setProfessorName("");
    setIsAnonymous(false);
    setGeneralTags([]);
    attachments.forEach((a) => URL.revokeObjectURL(a.preview));
    setAttachments([]);
    setError(null);
  }

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    if (!userId) return;
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const allowed = files.slice(0, MAX_IMAGES - attachments.length);
    if (imageInputRef.current) imageInputRef.current.value = "";

    const newEntries: AttachmentState[] = allowed.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      path: null,
      uploading: true,
      error: null,
    }));
    setAttachments((prev) => [...prev, ...newEntries]);

    // Upload each immediately in background
    allowed.forEach(async (file, idx) => {
      const globalIdx = attachments.length + idx;
      try {
        const ext = file.name.split(".").pop() ?? "jpg";
        const storagePath = `${userId}/community/${crypto.randomUUID()}.${ext}`;
        const path = await uploadFile(storagePath, file, {
          maxBytes: MAX_IMAGE_BYTES,
          accept: ["image"],
        });
        setAttachments((prev) =>
          prev.map((a, i) => (i === globalIdx ? { ...a, path, uploading: false } : a)),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setAttachments((prev) =>
          prev.map((a, i) => (i === globalIdx ? { ...a, uploading: false, error: msg } : a)),
        );
      }
    });
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    if (attachments.some((a) => a.uploading)) {
      setError("Images are still uploading, please wait.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const post = await createPost({
        title: title.trim(),
        body: body.trim(),
        courseCode: courseCode.trim() || undefined,
        professorName: professorName.trim() || undefined,
        isAnonymous,
        generalTags,
      });

      // Insert attachment rows directly via Supabase (RLS handles auth)
      const readyAttachments = attachments.filter((a) => a.path && !a.error);
      if (readyAttachments.length > 0 && userId) {
        const supabase = createClient();
        await supabase.from("community_post_attachments").insert(
          readyAttachments.map((a) => ({
            post_id: post.id,
            user_id: userId,
            storage_path: a.path!,
            name: a.file.name,
            mime_type: a.file.type,
            size_bytes: a.file.size,
          })),
        );
      }

      onCreated(post);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create post");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(v: boolean) => {
        setOpen(v);
      }}
    >
      {triggerElement ? <Dialog.Trigger asChild>{triggerElement}</Dialog.Trigger> : null}

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content
          id={dialogContentId}
          className="fixed left-1/2 top-1/2 z-50 flex w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-hub-surface shadow-[0_32px_80px_rgba(0,0,0,0.66)]"
        >
          <div className="flex items-start justify-between gap-6 border-b border-white/[0.06] px-6 py-5">
            <div className="min-w-0">
              <Dialog.Title className="font-[family-name:var(--font-outfit)] text-[18px] font-semibold tracking-tight text-hub-text">
                New Post
              </Dialog.Title>
              <p className="mt-1 text-[13px] leading-relaxed text-hub-text-muted">
                Share a question, warning, or insight. Keep it short and useful.
              </p>
            </div>
            <Dialog.Close className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-hub-text-muted transition hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-hub-text">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col">
            <div className="space-y-5 px-6 py-5">
              {/* General tags */}
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-hub-text-muted">
                  Post type
                </label>
                <div className="flex flex-wrap gap-2">
                  {GENERAL_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleGeneralTag(tag)}
                      className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition ${
                        generalTags.includes(tag)
                          ? tag === "Classes"
                            ? "border-hub-cyan/40 bg-hub-cyan/12 text-hub-cyan"
                            : tag === "Advice"
                            ? "border-hub-gold/40 bg-hub-gold/12 text-hub-gold"
                            : "border-white/20 bg-white/10 text-hub-text"
                          : "border-white/[0.08] bg-transparent text-hub-text-muted hover:border-white/[0.14] hover:bg-white/[0.03] hover:text-hub-text"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subject tags: course code + professor */}
              <div>
                <div className="mb-2 flex items-end justify-between gap-4">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-hub-text-muted">
                    Subject tags
                  </label>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.1fr_1fr]">
                  <label className="flex min-w-0 items-center gap-2 rounded-lg border border-white/[0.08] bg-hub-bg/55 px-3 py-2.5 transition focus-within:border-hub-cyan/40 focus-within:ring-1 focus-within:ring-hub-cyan/20">
                    <span className="text-[12px] font-medium text-hub-text-muted">Course</span>
                    <input
                      type="text"
                      placeholder="e.g. CSE 12"
                      value={courseCode}
                      onChange={(e) => setCourseCode(e.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-sm text-hub-text outline-none placeholder:text-hub-text-muted/60"
                    />
                  </label>
                  <label className="flex min-w-0 items-center gap-2 rounded-lg border border-white/[0.08] bg-hub-bg/55 px-3 py-2.5 transition focus-within:border-hub-cyan/40 focus-within:ring-1 focus-within:ring-hub-cyan/20">
                    <span className="text-[12px] font-medium text-hub-text-muted">Professor</span>
                    <input
                      type="text"
                      placeholder=" [Optional] e.g. Bryan Chin"
                      value={professorName}
                      onChange={(e) => setProfessorName(e.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-sm text-hub-text outline-none placeholder:text-hub-text-muted/60"
                    />
                  </label>
                </div>
              </div>

              {/* Title */}
              <div>
                <div className="mb-2 flex items-end justify-between gap-4">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-hub-text-muted">
                    Title <span className="text-hub-danger">*</span>
                  </label>
                  <span className={`text-[12px] ${title.length > 120 ? "text-hub-danger" : "text-hub-text-muted"}`}>
                    {title.length} / 120
                  </span>
                </div>
                <input
                  type="text"
                  required
                  maxLength={120}
                  placeholder="What's your question or topic?"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-10 w-full rounded-lg border border-white/[0.08] bg-hub-bg/55 px-3 text-sm text-hub-text outline-none placeholder:text-hub-text-muted/60 focus:border-hub-cyan/40 focus:ring-1 focus:ring-hub-cyan/20"
                />
              </div>

              {/* Body */}
              <div>
                <div className="mb-2 flex items-end justify-between gap-4">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-hub-text-muted">
                    Body <span className="text-hub-danger">*</span>
                  </label>
                  <span className="text-[12px] text-hub-text-muted">Be specific about what you want feedback on</span>
                </div>
                <textarea
                  required
                  rows={6}
                  placeholder="Share details, context, or your thoughts…"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full resize-none rounded-lg border border-white/[0.08] bg-hub-bg/55 px-3 py-3 text-sm leading-relaxed text-hub-text outline-none placeholder:text-hub-text-muted/60 focus:border-hub-cyan/40 focus:ring-1 focus:ring-hub-cyan/20"
                />
              </div>

              {/* Image attachments */}
              {userId && (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-4">
                  <div className="mb-3 flex items-center justify-between gap-4">
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-hub-text-muted">
                        Images
                      </label>
                      <p className="mt-1 text-[12px] text-hub-text-muted">Optional, up to {MAX_IMAGES}</p>
                    </div>
                    {attachments.length < MAX_IMAGES && (
                      <button
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-hub-bg/55 px-3 py-2 text-[12px] text-hub-text-muted transition hover:border-white/[0.14] hover:text-hub-text"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        Attach files
                      </button>
                    )}
                  </div>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImagePick}
                    className="hidden"
                  />
                  {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {attachments.map((att, i) => (
                        <div key={att.preview} className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={att.preview}
                            alt={att.file.name}
                            className={`h-20 w-20 rounded-lg object-cover border transition ${
                              att.error
                                ? "border-hub-danger/50 opacity-60"
                                : att.uploading
                                ? "border-white/[0.08] opacity-60"
                                : "border-hub-cyan/30"
                            }`}
                          />
                          {att.uploading && (
                            <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40">
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                            </span>
                          )}
                          {att.error && (
                            <span className="absolute bottom-1 left-1 right-1 truncate rounded bg-hub-danger/80 px-1 text-[9px] text-white">
                              {att.error}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => removeAttachment(i)}
                            className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-white/[0.12] bg-hub-bg text-hub-text-muted transition hover:text-hub-danger"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ))}
                      {attachments.length < MAX_IMAGES && (
                        <button
                          type="button"
                          onClick={() => imageInputRef.current?.click()}
                          className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-white/[0.12] text-hub-text-muted transition hover:border-hub-cyan/30 hover:text-hub-cyan"
                        >
                          <ImageIcon className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Anonymous toggle */}
              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-white/[0.06] bg-hub-bg/40 px-4 py-3">
                <span className="flex min-w-0 flex-col pr-4">
                  <span className="text-[13px] font-medium text-hub-text-secondary">Post anonymously</span>
                  <span className="mt-0.5 text-[11px] text-hub-text-muted">Your name will be hidden from other students</span>
                </span>
                <span className="relative ml-4 shrink-0">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={isAnonymous}
                    onChange={(e) => setIsAnonymous(e.target.checked)}
                  />
                  <span className="block h-5 w-9 rounded-full border border-white/[0.1] bg-white/[0.08] transition-colors peer-checked:border-hub-cyan/50 peer-checked:bg-hub-cyan/20" />
                  <span className="absolute left-0.5 top-0.5 block h-4 w-4 rounded-full bg-hub-text-muted shadow transition-all peer-checked:translate-x-4 peer-checked:bg-hub-cyan" />
                </span>
              </label>

              {error && <p className="text-sm text-hub-danger">{error}</p>}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-white/[0.06] px-6 py-4">
              <Dialog.Close
                type="button"
                className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 text-sm text-hub-text-secondary transition hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-hub-text"
              >
                Cancel
              </Dialog.Close>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex h-9 items-center rounded-lg bg-hub-cyan px-4 text-sm font-medium text-hub-bg transition hover:brightness-110 disabled:opacity-60"
              >
                {loading ? "Posting…" : "Post"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
