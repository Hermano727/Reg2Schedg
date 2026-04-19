"use client";

import { useRef, useState } from "react";
import { Paperclip, X, FileText, ImageIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/storage";
import { createReply } from "@/lib/api/community";
import { FormatToolbar } from "./FormatToolbar";
import type { ReplyOut } from "@/types/community";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "text/plain", "application/pdf"];
const MAX_BYTES = 10 * 1_000_000;

type PendingAttachment = {
  file: File;
  path: string;
  previewUrl?: string;
};

type ReplyComposerProps = {
  postId: string;
  parentReplyId?: string;
  onSubmitted: (replies: ReplyOut[]) => void;
  onCancel?: () => void;
  startExpanded?: boolean;
};

export function ReplyComposer({
  postId,
  parentReplyId,
  onSubmitted,
  onCancel,
  startExpanded = false,
}: ReplyComposerProps) {
  const [expanded, setExpanded] = useState(startExpanded);
  const [body, setBody] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleToggleFormat(label: string) {
    setActiveFormats((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  }

  function handleCancel() {
    setExpanded(false);
    setBody("");
    setIsAnonymous(false);
    setActiveFormats(new Set());
    setError(null);
    setAttachments([]);
    onCancel?.();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!files.length) return;

    setUploading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const newAttachments: PendingAttachment[] = [];
      for (const file of files) {
        if (!ALLOWED_TYPES.includes(file.type)) {
          setError(`${file.name}: file type not allowed (png, jpg, gif, webp, txt, pdf only)`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          setError(`${file.name}: too large (max 10 MB)`);
          continue;
        }
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `${user.id}/community/${Date.now()}_${safe}`;
        const path = await uploadFile(storagePath, file, { maxBytes: MAX_BYTES, accept: ALLOWED_TYPES });
        const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
        newAttachments.push({ file, path, previewUrl });
      }
      setAttachments((prev) => [...prev, ...newAttachments]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function removeAttachment(path: string) {
    setAttachments((prev) => prev.filter((a) => a.path !== path));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await createReply(postId, {
        body: body.trim(),
        parentReplyId,
        isAnonymous,
        attachmentPaths: attachments.map((a) => a.path),
      });
      onSubmitted(updated.replies);
      handleCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post reply");
    } finally {
      setLoading(false);
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full rounded-lg border border-white/[0.07] bg-transparent px-4 py-3 text-left text-sm text-hub-text-muted/70 transition-colors hover:border-white/[0.15] hover:text-hub-text-muted"
      >
        Join the conversation…
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-white/[0.12] overflow-hidden focus-within:border-hub-cyan/30 transition-colors">
      <FormatToolbar
        textareaRef={textareaRef}
        value={body}
        onChange={setBody}
        activeFormats={activeFormats}
        onToggleFormat={handleToggleFormat}
      />
      <form onSubmit={handleSubmit} className="flex flex-col bg-transparent">
        <textarea
          ref={textareaRef}
          required
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What are your thoughts?"
          className="w-full resize-none bg-transparent px-4 py-3 text-sm text-hub-text outline-none placeholder:text-hub-text-muted/60"
        />

        {/* Pending attachment previews */}
        {attachments.length > 0 && (
          <div className="flex flex-col gap-2 px-4 pb-2">
            <div className="flex flex-wrap gap-2">
              {attachments.map((att) =>
                att.previewUrl ? (
                  <div key={att.path} className="group relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={att.previewUrl}
                      alt={att.file.name}
                      className="h-16 w-16 rounded-md object-cover border border-white/[0.1]"
                    />
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.path)}
                      className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-hub-danger text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ) : (
                  <div key={att.path} className="group relative flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-hub-surface/50 px-2 py-1">
                    <FileText className="h-3.5 w-3.5 text-hub-text-muted" />
                    <span className="max-w-[120px] truncate text-[11px] text-hub-text-secondary">{att.file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.path)}
                      className="ml-1 text-hub-text-muted/60 hover:text-hub-danger transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )
              )}
            </div>
            {!body.trim() && (
              <p className="text-[11px] text-hub-gold/80">
                Add a message to post with your attachment.
              </p>
            )}
          </div>
        )}

        {/* Footer bar */}
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-3 py-2">
          <div className="flex items-center gap-3">
            {/* Paperclip — triggers hidden file input */}
            <button
              type="button"
              title="Attach file"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex h-6 w-6 items-center justify-center text-hub-text-muted/60 transition-colors hover:text-hub-cyan disabled:opacity-30"
            >
              {uploading ? (
                <span className="h-3.5 w-3.5 rounded-full border-2 border-hub-cyan/40 border-t-hub-cyan animate-spin block" />
              ) : (
                <Paperclip className="h-3.5 w-3.5" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.gif,.webp,.txt,.pdf"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />

            <label className="flex cursor-pointer items-center gap-1.5 select-none">
              <span className="relative">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                />
                <span className="block h-3.5 w-6 rounded-full border border-white/[0.1] bg-white/[0.06] transition-colors peer-checked:border-hub-cyan/40 peer-checked:bg-hub-cyan/15" />
                <span className="absolute left-0.5 top-0.5 block h-2.5 w-2.5 rounded-full bg-hub-text-muted/50 shadow transition-all peer-checked:translate-x-2.5 peer-checked:bg-hub-cyan" />
              </span>
              <span className={`text-[11px] transition-colors ${isAnonymous ? "text-hub-text-muted" : "text-hub-text-muted/60"}`}>
                Anonymous
              </span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            {error && <span className="text-[11px] text-hub-danger">{error}</span>}
            <button
              type="button"
              onClick={handleCancel}
              className="h-6 px-2.5 text-[11px] text-hub-text-muted/70 transition-colors hover:text-hub-text-muted rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || uploading || !body.trim()}
              className="h-6 rounded px-3 text-[11px] font-semibold bg-hub-cyan text-hub-bg transition-all hover:brightness-110 disabled:opacity-95"
            >
              {loading ? "Posting…" : "Comment"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
