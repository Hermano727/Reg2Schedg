"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  BarChart2,
  BookmarkCheck,
  Command,
  GraduationCap,
  LayoutGrid,
  Layers,
  Map as MapIcon,
  Search,
  Settings,
  Users,
} from "lucide-react";

type PaletteItem = {
  id: string;
  group: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  href?: string;
  shortcut?: string;
  onSelect?: () => void;
};

const NAV_ITEMS: PaletteItem[] = [
  {
    id: "community",
    group: "Navigate",
    label: "Community",
    description: "Student posts and discussions",
    icon: Users,
    href: "/community",
  },
  {
    id: "settings",
    group: "Navigate",
    label: "Settings",
    description: "Account and preferences",
    icon: Settings,
    href: "/settings",
  },
  {
    id: "saved-plans",
    group: "Navigate",
    label: "Saved plans",
    description: "View and load your quarters",
    icon: BookmarkCheck,
    shortcut: "S",
  },
];

const WORKSPACE_ITEMS: PaletteItem[] = [
  {
    id: "phase-overview",
    group: "Workspace",
    label: "Overview",
    description: "Difficulty score and summary",
    icon: BarChart2,
    shortcut: "1",
  },
  {
    id: "phase-courses",
    group: "Workspace",
    label: "Courses",
    description: "Deep dive into each class",
    icon: LayoutGrid,
    shortcut: "2",
  },
  {
    id: "phase-logistics",
    group: "Workspace",
    label: "Logistics",
    description: "Campus map and weekly schedule",
    icon: MapIcon,
    shortcut: "3",
  },
  {
    id: "phase-review",
    group: "Workspace",
    label: "Review",
    description: "Full command center view",
    icon: Layers,
    shortcut: "4",
  },
];

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  onPhaseSelect?: (phase: string) => void;
  onOpenLookup?: (query: string) => void;
};

export function CommandPalette({ open, onClose, onPhaseSelect, onOpenLookup }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Dynamic "look up" item — always first, label changes with the current query
  const lookupItem: PaletteItem = {
    id: "lookup-course",
    group: "Look up",
    label: query.trim() ? `Look up "${query.trim()}"` : "Look up a class or professor",
    description: query.trim() ? "Search for professor ratings, grades & insights" : "Enter a course code to explore ratings, grades, and student insights",
    icon: GraduationCap,
    onSelect: () => onOpenLookup?.(query.trim()),
  };

  const allItems = [...NAV_ITEMS, ...WORKSPACE_ITEMS];

  const filteredRest = query.trim()
    ? allItems.filter(
        (item) =>
          item.label.toLowerCase().includes(query.toLowerCase()) ||
          item.description?.toLowerCase().includes(query.toLowerCase()),
      )
    : allItems;

  // Lookup item is always first
  const filtered = [lookupItem, ...filteredRest];

  // Group filtered items
  const groups = Array.from(new Set(filtered.map((i) => i.group)));

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const handleSelect = (item: PaletteItem) => {
    if (item.href) {
      router.push(item.href);
    } else if (item.id.startsWith("phase-")) {
      const phase = item.id.replace("phase-", "");
      onPhaseSelect?.(phase === "courses" ? "dossiers" : phase);
    } else if (item.onSelect) {
      item.onSelect();
    }
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && filtered[activeIndex]) {
        handleSelect(filtered[activeIndex]);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filtered, activeIndex]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="palette-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="palette-panel"
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="fixed left-1/2 top-[18vh] z-[61] w-full max-w-[520px] -translate-x-1/2 overflow-hidden rounded-xl border border-white/[0.1] bg-[#0d1f35] shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
          >
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-white/40" aria-hidden />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Research class or jump to..."
                className="flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/30 outline-none"
              />
              <kbd className="hidden items-center gap-1 rounded border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-white/30 sm:flex">
                ESC
              </kbd>
            </div>

            {/* Items */}
            <div className="max-h-[360px] overflow-y-auto p-1.5">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-white/30">
                  No results for &ldquo;{query}&rdquo;
                </p>
              ) : (
                groups.map((group) => {
                  const items = filtered.filter((i) => i.group === group);
                  return (
                    <div key={group} className="mb-1">
                      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                        {group}
                      </p>
                      {items.map((item) => {
                        const Icon = item.icon;
                        const flatIndex = filtered.indexOf(item);
                        const isActive = flatIndex === activeIndex;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onMouseEnter={() => setActiveIndex(flatIndex)}
                            onClick={() => handleSelect(item)}
                            className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors ${
                              isActive ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
                            }`}
                          >
                            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                              isActive ? "border-hub-cyan/30 bg-hub-cyan/10 text-hub-cyan" : "border-white/[0.08] bg-white/[0.03] text-white/40"
                            }`}>
                              <Icon className="h-3.5 w-3.5" aria-hidden />
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-medium text-white/90">{item.label}</span>
                              {item.description && (
                                <span className="block text-xs text-white/40">{item.description}</span>
                              )}
                            </span>
                            {item.shortcut && (
                              <kbd className="shrink-0 rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-white/30">
                                {item.shortcut}
                              </kbd>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer hint */}
            <div className="flex items-center gap-4 border-t border-white/[0.06] px-4 py-2">
              <span className="flex items-center gap-1.5 text-[10px] text-white/25">
                <kbd className="font-[family-name:var(--font-jetbrains-mono)]">↑↓</kbd> navigate
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-white/25">
                <kbd className="font-[family-name:var(--font-jetbrains-mono)]">↵</kbd> select
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-white/25">
                <kbd className="font-[family-name:var(--font-jetbrains-mono)]">ESC</kbd> close
              </span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Hook to register global Cmd+K / Ctrl+K listener
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return { open, setOpen };
}

// Trigger button for the header
export function CommandPaletteTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 w-full items-center gap-2.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 text-sm text-white/40 transition hover:border-white/[0.14] hover:text-white/60 active:scale-[0.98]"
      aria-label="Open command palette"
    >
      <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="flex-1 text-left">Research class or jump to...</span>
      <span className="hidden items-center gap-0.5 sm:flex">
        <kbd className="flex h-5 w-5 items-center justify-center rounded border border-white/[0.08] bg-white/[0.04] font-[family-name:var(--font-jetbrains-mono)] text-[9px] text-white/30">
          <Command className="h-2.5 w-2.5" />
        </kbd>
        <kbd className="flex h-5 w-5 items-center justify-center rounded border border-white/[0.08] bg-white/[0.04] font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-white/30">
          K
        </kbd>
      </span>
    </button>
  );
}
