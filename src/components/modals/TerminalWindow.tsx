"use client";

import { useEffect, useRef } from "react";

type TerminalWindowProps = {
  lines: string[];
};

export function TerminalWindow({ lines }: TerminalWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return (
    <div className="flex h-52 flex-col rounded-lg border border-white/[0.08] bg-[#050b14] font-[family-name:var(--font-jetbrains-mono)] text-[11px] leading-relaxed shadow-inner">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2 text-hub-text-muted">
        <span className="h-2 w-2 rounded-full bg-hub-danger/90" />
        <span className="h-2 w-2 rounded-full bg-hub-gold/90" />
        <span className="h-2 w-2 rounded-full bg-hub-success/90" />
        <span className="ml-2 text-[10px] uppercase tracking-wider">
          Agent terminal
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 text-hub-text-secondary">
        {lines.length === 0 ? (
          <p className="text-hub-text-muted">Awaiting signal…</p>
        ) : (
          <ul className="space-y-1">
            {lines.map((line, i) => (
              <li key={`${i}-${line}`} className="break-words">
                <span className="text-hub-cyan/80">&gt;</span>{" "}
                <span className="text-hub-text-secondary/95">{line}</span>
              </li>
            ))}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
