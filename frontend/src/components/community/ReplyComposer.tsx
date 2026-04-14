"use client";

import { useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import { createReply } from "@/lib/api/community";
import { FormatToolbar } from "./FormatToolbar";
import type { ReplyOut } from "@/types/community";

type ReplyComposerProps = {
  postId: string;
  parentReplyId?: string;
  /** Called with the full updated reply list (from PostDetail) */
  onSubmitted: (replies: ReplyOut[]) => void;
  onCancel?: () => void;
  /** If true, starts expanded (used for inline reply-to-reply) */
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleToggleFormat(label: string) {
    setActiveFormats((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }

  function handleCancel() {
    setExpanded(false);
    setBody("");
    setIsAnonymous(false);
    setActiveFormats(new Set());
    setError(null);
    onCancel?.();
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
        className="w-full rounded-lg border border-white/[0.07] bg-transparent px-4 py-3 text-left text-sm text-hub-text-muted/50 transition-colors hover:border-white/[0.12] hover:text-hub-text-muted"
      >
        Join the conversation…
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-white/[0.12] overflow-hidden focus-within:border-hub-cyan/30 transition-colors">
      {/* Format toolbar sits flush at the top */}
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
          className="w-full resize-none bg-transparent px-4 py-3 text-sm text-hub-text outline-none placeholder:text-hub-text-muted/40"
        />

        {/* Footer bar */}
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-3 py-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              title="Attach image (coming soon)"
              className="flex h-6 w-6 items-center justify-center text-hub-text-muted/30 transition-colors hover:text-hub-text-muted/60"
            >
              <Paperclip className="h-3.5 w-3.5" />
            </button>

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
              <span className={`text-[11px] transition-colors ${isAnonymous ? "text-hub-text-muted" : "text-hub-text-muted/50"}`}>
                Anonymous
              </span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            {error && <span className="text-[11px] text-hub-danger">{error}</span>}
            <button
              type="button"
              onClick={handleCancel}
              className="h-6 px-2.5 text-[11px] text-hub-text-muted/50 transition-colors hover:text-hub-text-muted rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !body.trim()}
              className="h-6 rounded px-3 text-[11px] font-semibold bg-hub-cyan text-hub-bg transition-all hover:brightness-110 disabled:opacity-40"
            >
              {loading ? "Posting…" : "Comment"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
