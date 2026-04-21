"use client";

import { useEffect, useRef, useState } from "react";
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
  trigger: React.ReactNode;
  onCreated: (post: PostSummary) => void;
  userId?: string;
  initialCourseCode?: string;
  initialProfessorName?: string;
};

export function CreatePostModal({ trigger, onCreated, userId, initialCourseCode, initialProfessorName }: CreatePostModalProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [professorName, setProfessorName] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [generalTags, setGeneralTags] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<AttachmentState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed pre-filled values when opened from an external context (e.g. ClassLookupModal)
  useEffect(() => {
    if (open) {
      if (initialCourseCode) setCourseCode(initialCourseCode);
      if (initialProfessorName) setProfessorName(initialProfessorName);
    }
  }, [open, initialCourseCode, initialProfessorName]);

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
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create post");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v: boolean) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="glass-panel fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/[0.1] p-6 shadow-xl">
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-hub-text">New Post</Dialog.Title>
            <Dialog.Close className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-hub-text-muted transition hover:text-hub-text">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* General tags */}
            <div>
              <label className="mb-2 block text-xs font-medium text-hub-text-secondary">
                Post type <span className="text-hub-text-muted">(pick all that apply)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {GENERAL_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleGeneralTag(tag)}
                    className={`h-7 rounded-full border px-3 text-xs font-medium transition ${
                      generalTags.includes(tag)
                        ? tag === "Classes"
                          ? "border-hub-cyan/50 bg-hub-cyan/20 text-hub-cyan"
                          : tag === "Advice"
                          ? "border-hub-gold/50 bg-hub-gold/20 text-hub-gold"
                          : "border-white/20 bg-white/10 text-hub-text"
                        : "border-white/[0.08] bg-transparent text-hub-text-muted hover:border-white/20 hover:text-hub-text"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Subject tags: course code + professor */}
            <div>
              <label className="mb-2 block text-xs font-medium text-hub-text-secondary">
                Subject tags <span className="text-hub-text-muted">(optional)</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Course code (e.g. CSE 110)"
                  value={courseCode}
                  onChange={(e) => setCourseCode(e.target.value)}
                  className="h-9 w-full rounded-lg border border-white/[0.08] bg-hub-bg/80 px-3 text-sm text-hub-text outline-none ring-hub-cyan/40 placeholder:text-hub-text-muted focus:border-hub-cyan/40 focus:ring-2"
                />
                <input
                  type="text"
                  placeholder="Professor (e.g. Bryan Chin)"
                  value={professorName}
                  onChange={(e) => setProfessorName(e.target.value)}
                  className="h-9 w-full rounded-lg border border-white/[0.08] bg-hub-bg/80 px-3 text-sm text-hub-text outline-none ring-hub-cyan/40 placeholder:text-hub-text-muted focus:border-hub-cyan/40 focus:ring-2"
                />
              </div>
            </div>

            {/* Title */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-hub-text-secondary">
                  Title <span className="text-hub-danger">*</span>
                </label>
                <span className={`text-xs ${title.length > 120 ? "text-hub-danger" : "text-hub-text-muted"}`}>
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
                className="h-9 w-full rounded-lg border border-white/[0.08] bg-hub-bg/80 px-3 text-sm text-hub-text outline-none ring-hub-cyan/40 placeholder:text-hub-text-muted focus:border-hub-cyan/40 focus:ring-2"
              />
            </div>

            {/* Body */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-hub-text-secondary">
                Body <span className="text-hub-danger">*</span>
              </label>
              <textarea
                required
                rows={5}
                placeholder="Share details, context, or your thoughts…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full resize-none rounded-lg border border-white/[0.08] bg-hub-bg/80 px-3 py-2.5 text-sm text-hub-text outline-none ring-hub-cyan/40 placeholder:text-hub-text-muted focus:border-hub-cyan/40 focus:ring-2"
              />
            </div>

            {/* Image attachments */}
            {userId && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-medium text-hub-text-secondary">
                    Images <span className="text-hub-text-muted">(optional · up to {MAX_IMAGES})</span>
                  </label>
                  {attachments.length < MAX_IMAGES && (
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] px-2 py-1 text-[11px] text-hub-text-muted transition hover:border-white/[0.18] hover:text-hub-text"
                    >
                      <Paperclip className="h-3 w-3" />
                      Attach
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
                          className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-hub-bg border border-white/[0.12] text-hub-text-muted transition hover:text-hub-danger"
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
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-white/[0.06] bg-hub-bg/40 px-3 py-2.5">
              <span className="flex flex-col">
                <span className="text-xs font-medium text-hub-text-secondary">Post anonymously</span>
                <span className="text-[10px] text-hub-text-muted">Your name will be hidden from other students</span>
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

            <div className="flex justify-end gap-3">
              <Dialog.Close
                type="button"
                className="h-9 rounded-lg border border-white/[0.08] px-4 text-sm text-hub-text-secondary transition hover:border-white/[0.14] hover:text-hub-text"
              >
                Cancel
              </Dialog.Close>
              <button
                type="submit"
                disabled={loading}
                className="h-9 rounded-lg bg-hub-cyan px-4 text-sm font-medium text-hub-bg transition hover:brightness-110 disabled:opacity-60"
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
