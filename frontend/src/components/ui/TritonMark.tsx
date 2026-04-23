"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";

type TritonMarkProps = {
  className?: string;
  pulse?: boolean;
  size?: number;
};

function IconImage({ className }: { className?: string }) {
  return (
    <Image
      src="/images/reg2schedg_64x64icon.png"
      alt="Reg2Schedg"
      width={64}
      height={64}
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
      className={`relative inline-flex items-center justify-center ${className}`}
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
      <IconImage className="h-full w-full object-contain" />
    </motion.div>
  );
}
