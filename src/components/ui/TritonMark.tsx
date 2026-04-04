"use client";

import { motion, useReducedMotion } from "framer-motion";

type TritonMarkProps = {
  className?: string;
  pulse?: boolean;
  size?: number;
};

function TridentGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M12 2v20M12 2c-2.5 3-4 6.2-4 9.5a4 4 0 008 0c0-3.3-1.5-6.5-4-9.5M7 8.5h3.5M13.5 8.5H17"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TritonMark({
  className = "",
  pulse = false,
  size = 40,
}: TritonMarkProps) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={`relative inline-flex items-center justify-center rounded-xl border border-white/10 bg-hub-surface-elevated text-hub-cyan shadow-[0_0_24px_rgba(0,212,255,0.15)] ${className}`}
      style={{ width: size, height: size }}
      animate={
        pulse && !reduce
          ? { scale: [1, 1.04, 1], opacity: [0.9, 1, 0.9] }
          : undefined
      }
      transition={
        pulse && !reduce
          ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" }
          : undefined
      }
      aria-hidden
    >
      <TridentGlyph className="h-[55%] w-[55%]" />
    </motion.div>
  );
}
