"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { createPost } from "@/lib/api/community";
import type { PostSummary } from "@/types/community";

type CreatePostModalProps = {
  trigger: React.ReactNode;
  onCreated: (post: PostSummary) => void;
};

export function CreatePostModal({ trigger, onCreated }: CreatePostModalProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle("");
    setBody("");
    setCourseCode("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const post = await createPost({
        title: title.trim(),
        body: body.trim(),
        courseCode: courseCode.trim() || undefined,
      });
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
            <Dialog.Title className="text-lg font-semibold text-hub-text">
              New Post
            </Dialog.Title>
            <Dialog.Close className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-hub-text-muted transition hover:text-hub-text">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-hub-text-secondary">
                Course code <span className="text-hub-text-muted">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. CSE 110"
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value)}
                className="h-9 w-full rounded-lg border border-white/[0.08] bg-hub-bg/80 px-3 text-sm text-hub-text outline-none ring-hub-cyan/40 placeholder:text-hub-text-muted focus:border-hub-cyan/40 focus:ring-2"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-hub-text-secondary">
                Title <span className="text-hub-danger">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="What's your question or topic?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-9 w-full rounded-lg border border-white/[0.08] bg-hub-bg/80 px-3 text-sm text-hub-text outline-none ring-hub-cyan/40 placeholder:text-hub-text-muted focus:border-hub-cyan/40 focus:ring-2"
              />
            </div>

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

            {error && (
              <p className="text-sm text-hub-danger">{error}</p>
            )}

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
