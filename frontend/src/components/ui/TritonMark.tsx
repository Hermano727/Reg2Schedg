"use client";

import { motion, useReducedMotion } from "framer-motion";

type TritonMarkProps = {
  className?: string;
  pulse?: boolean;
  size?: number;
};

function IconImage({ className }: { className?: string }) {
  return (
    <img
      src="/images/web2schedg_icon.png"
      alt="Reg2Schedg"
      className={className}
      aria-hidden
    />
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
      <IconImage className="h-[55%] w-[55%] object-contain" />
    </motion.div>
  );
}
