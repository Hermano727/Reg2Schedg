"use client";

import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/storage";
import type { VaultItem } from "@/types/dossier";

type Kind = VaultItem["kind"];

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "syllabus", label: "Syllabus" },
  { value: "webreg", label: "WebReg export" },
  { value: "note", label: "Note" },
  { value: "pdf", label: "PDF" },
  { value: "image", label: "Image" },
  { value: "doc", label: "Document" },
];

const ACCEPT = [
  "application/pdf",
  "image",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const MAX_BYTES = 50 * 1_000_000; // 50 MB

type Props = {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function VaultUploadModal({ userId, open, onOpenChange, onSuccess }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("pdf");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setName("");
    setKind("pdf");
    setError(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
    // Auto-detect kind
    if (f.type.startsWith("image/")) setKind("image");
    else if (f.type === "application/pdf") setKind("pdf");
    else if (f.type.includes("wordprocessing")) setKind("doc");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !name.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const storagePath = `${userId}/vault/${crypto.randomUUID()}.${ext}`;

      await uploadFile(storagePath, file, { maxBytes: MAX_BYTES, accept: ACCEPT });

      const supabase = createClient();
      const { error: dbErr } = await supabase.from("vault_items").insert({
        user_id: userId,
        name: name.trim(),
        kind,
        storage_path: storagePath,
        mime_type: file.type,
        size_bytes: file.size,
      });
      if (dbErr) throw new Error(dbErr.message);

      onSuccess();
      onOpenChange(false);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="glass-panel fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/[0.1] p-6 shadow-xl">
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title className="text-base font-semibold text-hub-text">
              Upload to vault
            </Dialog.Title>
            <Dialog.Close className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-hub-text-muted transition hover:text-hub-text">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* File picker */}
            <div>
              <label className="mb-2 block text-xs font-medium text-hub-text-secondary">
                File <span className="text-hub-danger">*</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.doc,.docx"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center gap-3 rounded-xl border border-dashed border-white/[0.14] bg-hub-bg/40 px-4 py-5 text-left transition hover:border-hub-cyan/30 hover:bg-hub-surface/40"
              >
                <Upload className="h-5 w-5 shrink-0 text-hub-cyan" />
                <span className="min-w-0">
                  {file ? (
                    <>
                      <span className="block truncate text-sm font-medium text-hub-text">
                        {file.name}
                      </span>
                      <span className="text-xs text-hub-text-muted">
                        {(file.size / 1_000_000).toFixed(1)} MB
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-hub-text-muted">
                      Click to select — PDF, image, doc, txt · Max 50 MB
                    </span>
                  )}
                </span>
              </button>
            </div>

            {/* Name */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-hub-text-secondary">
                Name <span className="text-hub-danger">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. CSE 110 Syllabus"
                className="h-9 w-full rounded-lg border border-white/[0.08] bg-hub-bg/80 px-3 text-sm text-hub-text outline-none ring-hub-cyan/40 placeholder:text-hub-text-muted focus:border-hub-cyan/40 focus:ring-2"
              />
            </div>

            {/* Kind */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-hub-text-secondary">
                Type
              </label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as Kind)}
                className="h-9 w-full rounded-lg border border-white/[0.08] bg-hub-bg/80 px-3 text-sm text-hub-text outline-none focus:border-hub-cyan/40 focus:ring-2 focus:ring-hub-cyan/40"
              >
                {KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

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
                disabled={loading || !file}
                className="h-9 rounded-lg bg-hub-cyan px-4 text-sm font-medium text-hub-bg transition hover:brightness-110 disabled:opacity-50"
              >
                {loading ? "Uploading…" : "Upload"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
