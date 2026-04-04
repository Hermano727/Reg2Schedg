"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { TritonMark } from "@/components/ui/TritonMark";
import { TerminalWindow } from "@/components/modals/TerminalWindow";

type ProcessingModalProps = {
  open: boolean;
  lines: string[];
};

export function ProcessingModal({ open, lines }: ProcessingModalProps) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open || lines.length === 0) return;
    const el = document.activeElement as HTMLElement | null;
    el?.blur?.();
  }, [open, lines.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="processing-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
        >
          <motion.div
            className="absolute inset-0 bg-hub-bg/70 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            layout
            className="relative z-10 w-full max-w-lg rounded-2xl border border-white/[0.1] bg-hub-surface p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
            initial={
              reduce
                ? false
                : { opacity: 0, y: 16, scale: 0.98, filter: "blur(6px)" }
            }
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={
              reduce ? undefined : { opacity: 0, y: 8, scale: 0.99, filter: "blur(4px)" }
            }
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
          >
            <div className="flex flex-col items-center text-center">
              <TritonMark pulse size={56} />
              <h2
                id="processing-title"
                className="mt-4 font-[family-name:var(--font-outfit)] text-lg font-semibold text-hub-text"
              >
                Synthesis in progress
              </h2>
              <p className="mt-1 text-sm text-hub-text-secondary">
                The agent is scraping SETs, Reddit, and your syllabus cues. Logs
                stream below for transparency.
              </p>
            </div>
            <div className="mt-5">
              <TerminalWindow lines={lines} />
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
