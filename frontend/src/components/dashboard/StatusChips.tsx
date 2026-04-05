import type { StatusChipData } from "@/types/dossier";

const dotClass: Record<StatusChipData["tone"], string> = {
  cyan: "bg-cyan-400",
  purple: "bg-violet-400",
  green: "bg-emerald-400",
  muted: "bg-white/25",
};

const textClass: Record<StatusChipData["tone"], string> = {
  cyan: "text-hub-text-secondary",
  purple: "text-hub-text-secondary",
  green: "text-hub-text-secondary",
  muted: "text-hub-text-muted",
};

type StatusChipsProps = {
  chips: StatusChipData[];
};

export function StatusChips({ chips }: StatusChipsProps) {
  if (chips.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {chips.map((c) => (
        <li key={c.id} className="flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass[c.tone]}`}
          />
          <span className={`text-sm ${textClass[c.tone]}`}>{c.label}</span>
        </li>
      ))}
    </ul>
  );
}
