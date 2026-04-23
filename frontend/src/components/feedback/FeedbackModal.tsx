"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Send, X } from "lucide-react";
import {
  submitFeedback,
  type FeedbackProductArea,
  type FeedbackReportType,
} from "@/lib/api/feedback";

const FEEDBACK_REPORT_TYPES: { value: FeedbackReportType; label: string; description: string }[] = [
  { value: "bug", label: "Bug report", description: "Something broke or behaved incorrectly." },
  { value: "feature", label: "Feature request", description: "A capability you want us to add." },
  { value: "ux", label: "UX issue", description: "The flow is confusing or harder than it should be." },
  { value: "general", label: "General feedback", description: "Ideas, praise, or anything else." },
];

const FEEDBACK_PRODUCT_AREAS: { value: FeedbackProductArea; label: string }[] = [
  { value: "command_center", label: "Command Center / Home" },
  { value: "profile", label: "Profile" },
  { value: "community", label: "Community" },
  { value: "calendar", label: "Calendar Sync" },
  { value: "lookup", label: "Class Lookup" },
  { value: "other", label: "Other" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  initialProductArea?: FeedbackProductArea;
};

export function FeedbackModal({ open, onClose, initialProductArea = "other" }: Props) {
  const [reportType, setReportType] = useState<FeedbackReportType>("bug");
  const [productArea, setProductArea] = useState<FeedbackProductArea>(initialProductArea);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [expectedBehavior, setExpectedBehavior] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setProductArea(initialProductArea);
    setStatus("idle");
    setErrorMessage("");
  }, [open, initialProductArea]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const canSubmit = title.trim().length >= 3 && description.trim().length >= 10 && status !== "sending";

  async function handleSubmit() {
    if (!canSubmit) return;
    setStatus("sending");
    setErrorMessage("");
    try {
      await submitFeedback({
        reportType,
        productArea,
        title: title.trim(),
        description: description.trim(),
        expectedBehavior: expectedBehavior.trim() || null,
        pagePath: `${window.location.pathname}${window.location.search}`,
        userAgent: navigator.userAgent,
        metadata: {
          source: "global_feedback_modal",
          locale: navigator.language ?? null,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
        },
      });
      setStatus("sent");
      setTitle("");
      setDescription("");
      setExpectedBehavior("");
      setReportType("bug");
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to send feedback.");
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[95] bg-black/60 backdrop-blur-[2px]"
          />
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
            className="fixed inset-x-0 top-[6vh] z-[96] mx-auto w-full max-w-3xl rounded-2xl border border-white/[0.09] bg-hub-surface shadow-[0_32px_80px_rgba(0,0,0,0.7)]"
          >
            <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-4">
              <div>
                <p className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-hub-text">Submit Feedback</p>
                <p className="mt-1 text-sm text-hub-text-muted">Report a bug, suggest a feature, or share feedback.</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white/40 transition hover:text-white/70"
                aria-label="Close feedback modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[78vh] overflow-y-auto px-6 py-5">
              {status === "sent" ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-hub-success/30 bg-hub-success/10 px-6 py-10 text-center">
                  <Check className="h-8 w-8 text-hub-success" />
                  <p className="font-medium text-hub-text">Thanks for the feedback.</p>
                  <button
                    type="button"
                    onClick={onClose}
                    className="text-xs text-hub-text-muted underline underline-offset-2 transition hover:text-hub-text"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-hub-text-muted">What are you reporting?</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {FEEDBACK_REPORT_TYPES.map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => {
                            setReportType(item.value);
                            if (status === "error") {
                              setStatus("idle");
                              setErrorMessage("");
                            }
                          }}
                          className={[
                            "rounded-lg border px-3 py-2 text-left transition",
                            reportType === item.value
                              ? "border-hub-cyan/45 bg-hub-cyan/12 text-hub-text"
                              : "border-white/[0.10] bg-white/[0.03] text-hub-text-secondary hover:border-white/[0.18] hover:text-hub-text",
                          ].join(" ")}
                        >
                          <p className="text-sm font-medium">{item.label}</p>
                          <p className="mt-0.5 text-xs text-hub-text-muted">{item.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-hub-text-muted">Area</span>
                    <select
                      value={productArea}
                      onChange={(event) => {
                        setProductArea(event.target.value as FeedbackProductArea);
                        if (status === "error") {
                          setStatus("idle");
                          setErrorMessage("");
                        }
                      }}
                      className="w-full rounded-xl border border-white/[0.10] bg-white/[0.03] px-4 py-2.5 text-sm text-hub-text outline-none transition focus:border-hub-cyan/40 focus:ring-1 focus:ring-hub-cyan/20"
                    >
                      {FEEDBACK_PRODUCT_AREAS.map((item) => (
                        <option key={item.value} value={item.value} className="bg-hub-surface-elevated">
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-hub-text-muted">What went wrong?</span>
                    <input
                      type="text"
                      maxLength={120}
                      placeholder="Short summary"
                      value={title}
                      onChange={(event) => {
                        setTitle(event.target.value);
                        if (status === "error") {
                          setStatus("idle");
                          setErrorMessage("");
                        }
                      }}
                      className="w-full rounded-xl border border-white/[0.10] bg-white/[0.03] px-4 py-2.5 text-sm text-hub-text placeholder:text-hub-text-muted outline-none transition focus:border-hub-cyan/40 focus:ring-1 focus:ring-hub-cyan/20"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-hub-text-muted">Description</span>
                    <textarea
                      rows={6}
                      maxLength={4000}
                      placeholder="Open description: what happened, and how can we reproduce it?"
                      value={description}
                      onChange={(event) => {
                        setDescription(event.target.value);
                        if (status === "error") {
                          setStatus("idle");
                          setErrorMessage("");
                        }
                      }}
                      className="w-full resize-none rounded-xl border border-white/[0.10] bg-white/[0.03] px-4 py-3 text-sm text-hub-text placeholder:text-hub-text-muted outline-none transition focus:border-hub-cyan/40 focus:ring-1 focus:ring-hub-cyan/20"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-hub-text-muted">What did you expect? (optional)</span>
                    <textarea
                      rows={3}
                      maxLength={2000}
                      placeholder="Expected result"
                      value={expectedBehavior}
                      onChange={(event) => {
                        setExpectedBehavior(event.target.value);
                        if (status === "error") {
                          setStatus("idle");
                          setErrorMessage("");
                        }
                      }}
                      className="w-full resize-none rounded-xl border border-white/[0.10] bg-white/[0.03] px-4 py-3 text-sm text-hub-text placeholder:text-hub-text-muted outline-none transition focus:border-hub-cyan/40 focus:ring-1 focus:ring-hub-cyan/20"
                    />
                  </label>

                  {status === "error" && (
                    <div className="rounded-lg border border-hub-danger/30 bg-hub-danger/10 px-3 py-2 text-xs text-hub-danger">
                      {errorMessage || "Could not send feedback. Please try again."}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={!canSubmit}
                      className="inline-flex h-9 items-center gap-2 rounded-lg bg-hub-cyan/15 px-4 text-sm font-semibold text-hub-cyan ring-1 ring-hub-cyan/35 transition hover:bg-hub-cyan/25 disabled:opacity-40"
                    >
                      {status === "sending" ? (
                        <>
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-hub-cyan/30 border-t-hub-cyan" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5" />
                          Send feedback
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
