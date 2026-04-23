import { createClient } from "@/lib/supabase/client";

const BUCKET = "user-content";

export async function uploadFile(
  storagePath: string,
  file: File | Blob,
  opts?: { maxBytes?: number; accept?: string[] },
): Promise<string> {
  if (opts?.maxBytes && file.size > opts.maxBytes) {
    const mb = Math.round(opts.maxBytes / 1_000_000);
    throw new Error(`File too large. Max: ${mb}MB`);
  }
  if (opts?.accept) {
    const ok = opts.accept.some(
      (t) => file.type === t || file.type.startsWith(t + "/"),
    );
    if (!ok) throw new Error(`File type not allowed: ${file.type}`);
  }

  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { upsert: true });

  if (error) throw new Error(error.message);
  return data.path;
}

export async function removeFile(storagePath: string): Promise<void> {
  const supabase = createClient();
  await supabase.storage.from(BUCKET).remove([storagePath]);
}
