import type { StatusChipData } from "@/types/dossier";

const toneClass: Record<StatusChipData["tone"], string> = {
  cyan: "border-cyan-400/25 bg-cyan-400/10 text-cyan-200",
  purple: "border-violet-400/25 bg-violet-400/10 text-violet-200",
  green: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  muted: "border-white/[0.08] bg-white/[0.04] text-hub-text-secondary",
};

type StatusChipsProps = {
  chips: StatusChipData[];
};

export function StatusChips({ chips }: StatusChipsProps) {
  return (
    <ul className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <li key={c.id}>
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClass[c.tone]}`}
          >
            {c.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
