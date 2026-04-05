"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { TritonMark } from "@/components/ui/TritonMark";

type ProcessingModalProps = {
  open: boolean;
};

export function ProcessingModal({ open }: ProcessingModalProps) {
  const reduce = useReducedMotion();

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
            className="relative z-10 flex flex-col items-center gap-6 text-center"
            initial={reduce ? false : { opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: 6, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
          >
            {/* Spinner ring around the mark */}
            <div className="relative flex items-center justify-center">
              <motion.div
                className="absolute h-20 w-20 rounded-full border-2 border-transparent border-t-hub-cyan/60"
                animate={reduce ? {} : { rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }}
              />
              <motion.div
                className="absolute h-28 w-28 rounded-full border border-transparent border-t-hub-cyan/20"
                animate={reduce ? {} : { rotate: -360 }}
                transition={{ repeat: Infinity, duration: 2.2, ease: "linear" }}
              />
              <TritonMark pulse size={48} />
            </div>

            <div>
              <h2
                id="processing-title"
                className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-hub-text"
              >
                Analyzing your schedule
              </h2>
              <p className="mt-1 text-sm text-hub-text-secondary">
                Researching courses, professors, and grade data…
              </p>
            </div>

            {/* Animated dots */}
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-hub-cyan/60"
                  animate={reduce ? {} : { opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                  transition={{
                    repeat: Infinity,
                    duration: 1.2,
                    delay: i * 0.2,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
