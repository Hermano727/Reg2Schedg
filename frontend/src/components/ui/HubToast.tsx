"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle, XCircle, X } from "lucide-react";

export type ToastPayload = { message: string; variant: "success" | "error" };

type Props = {
  toast: ToastPayload | null;
  onDismiss: () => void;
};

const DISMISS_MS = 3500;

export function HubToast({ toast, onDismiss }: Props) {
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(onDismiss, DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [toast, onDismiss]);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.message + toast.variant}
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-6 right-6 z-[200] flex items-center gap-3 rounded-xl border bg-hub-surface/95 px-4 py-3 shadow-xl backdrop-blur-sm"
          style={{
            borderColor: toast.variant === "success" ? "rgba(0,212,255,0.25)" : "rgba(255,107,107,0.25)",
            borderLeftWidth: 3,
            borderLeftColor: toast.variant === "success" ? "#00d4ff" : "#ff6b6b",
          }}
        >
          {toast.variant === "success"
            ? <CheckCircle className="h-4 w-4 shrink-0 text-hub-cyan" />
            : <XCircle className="h-4 w-4 shrink-0 text-hub-danger" />}
          <span className="text-sm font-medium text-hub-text">{toast.message}</span>
          <button
            type="button"
            onClick={onDismiss}
            className="ml-1 text-hub-text-muted transition hover:text-hub-text"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
