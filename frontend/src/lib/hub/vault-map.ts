import { formatUpdatedAt } from "@/lib/hub/format-updated";
import type { VaultItem } from "@/types/dossier";
import type { VaultItemRow } from "@/types/saved-plan";

export function vaultKindLabel(kind: VaultItem["kind"]): string {
  switch (kind) {
    case "syllabus": return "Syllabus";
    case "webreg": return "WebReg";
    case "pdf": return "PDF";
    case "image": return "Image";
    case "doc": return "Document";
    default: return "Note";
  }
}

export function vaultRowToVaultItem(row: VaultItemRow): VaultItem {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    mimeType: row.mime_type ?? null,
    sizeBytes: row.size_bytes ?? null,
    updatedAt: formatUpdatedAt(row.updated_at),
  };
}
