"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type {
  PriorityType,
  ScheduleBriefing,
  SkillFocus,
  TransitProfile,
} from "@/types/dossier";

type Props = {
  open: boolean;
  onSubmit: (data: ScheduleBriefing) => void;
  onSkip: () => void;
  researchDone?: boolean;
};

type ChipGroupProps<T extends string> = {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
};

function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: ChipGroupProps<T>) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-hub-text-muted">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
              value === opt.value
                ? "border-hub-cyan/50 bg-hub-cyan/15 text-hub-cyan"
                : "border-white/[0.1] bg-white/[0.03] text-hub-text-secondary hover:border-white/[0.2] hover:text-hub-text"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const PRIORITY_OPTIONS: { value: PriorityType; label: string }[] = [
  { value: "career", label: "Career" },
  { value: "research", label: "Research" },
  { value: "interest", label: "Interest" },
  { value: "grad_school", label: "Grad School" },
];

const SKILL_OPTIONS: { value: SkillFocus; label: string }[] = [
  { value: "project", label: "Projects" },
  { value: "theoretical", label: "Theoretical" },
  { value: "career", label: "Career Skills"},
  { value: "mixed", label: "Mixed" },
];

const TRANSIT_OPTIONS: { value: TransitProfile; label: string }[] = [
  { value: "walking", label: "Walking" },
  { value: "biking", label: "Biking" },
  { value: "spin", label: "Scooter" },
  { value: "car", label: "Car" },
];

const DEFAULT_FORM: Omit<ScheduleBriefing, "scheduleTitle"> & { scheduleTitle: string } = {
  scheduleTitle: "",
  priority: "career",
  balancedDifficulty: true,
  skillFocus: "mixed",
  transitProfile: "walking",
  careerGoals: "",
  currentWorries: "",
  externalCommitments: "",
};

export function ScheduleBriefingModal({ open, onSubmit, onSkip, researchDone = false }: Props) {
  const reduce = useReducedMotion();
  const [form, setForm] = useState(DEFAULT_FORM);

  function set<K extends keyof typeof DEFAULT_FORM>(key: K, val: (typeof DEFAULT_FORM)[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  function handleSubmit() {
    onSubmit({
      ...form,
      careerGoals: form.careerGoals?.trim() || undefined,
      currentWorries: form.currentWorries?.trim() || undefined,
      externalCommitments: form.externalCommitments?.trim() || undefined,
    });
    setForm(DEFAULT_FORM);
  }

  function handleSkip() {
    setForm(DEFAULT_FORM);
    onSkip();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="briefing-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
        >
          {/* Overlay — sits on top of ProcessingModal's backdrop */}
          <div className="absolute inset-0 bg-hub-bg/50 backdrop-blur-sm" />

          <motion.div
            className="relative z-10 w-full max-w-md"
            initial={reduce ? false : { opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.4 }}
          >
            {/* Card */}
            <div className="rounded-2xl border border-white/[0.1] bg-hub-surface shadow-2xl">
              {/* Status bar */}
              <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-2.5">
                {researchDone ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-hub-success shrink-0" />
                    <span className="text-[10px] font-medium text-hub-success/80">
                      Research complete — fill in context to continue
                    </span>
                  </>
                ) : (
                  <>
                    {/* Spinner rings (miniature version of the ProcessingModal animation) */}
                    <div className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                      <motion.div
                        className="absolute h-4 w-4 rounded-full border border-transparent border-t-hub-cyan/70"
                        animate={reduce ? {} : { rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }}
                      />
                      <motion.div
                        className="absolute h-2.5 w-2.5 rounded-full border border-transparent border-t-hub-cyan/30"
                        animate={reduce ? {} : { rotate: -360 }}
                        transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                      />
                    </div>
                    <span className="text-[10px] font-medium text-hub-text-muted">
                      Researching your schedule…
                    </span>
                  </>
                )}
              </div>

              {/* Form body */}
              <div className="space-y-4 overflow-y-auto px-4 py-4" style={{ maxHeight: "65vh" }}>
                <div>
                  <h2
                    id="briefing-title"
                    className="font-[family-name:var(--font-outfit)] text-sm font-semibold text-hub-text"
                  >
                    Name your schedule
                  </h2>
                  <p className="mt-0.5 text-[11px] text-hub-text-muted">
                    Add context to personalize your fitness score and advisories.
                  </p>
                </div>

                {/* Schedule title */}
                <div>
                  <label
                    htmlFor="briefing-title-input"
                    className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-hub-text-muted"
                  >
                    Schedule name
                  </label>
                  <input
                    id="briefing-title-input"
                    type="text"
                    value={form.scheduleTitle}
                    onChange={(e) => set("scheduleTitle", e.target.value)}
                    placeholder="e.g. Spring 2026 Draft 1"
                    className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-hub-text placeholder-hub-text-muted/60 outline-none transition focus:border-hub-cyan/40 focus:bg-white/[0.06]"
                  />
                </div>

                {/* Priority */}
                <ChipGroup
                  label="Primary priority"
                  options={PRIORITY_OPTIONS}
                  value={form.priority}
                  onChange={(v) => set("priority", v)}
                />

                {/* Difficulty tolerance */}
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-hub-text-muted">
                    Difficulty tolerance
                  </p>
                  <div className="flex gap-1.5">
                    {[
                      { value: true, label: "Balanced" },
                      { value: false, label: "Want to be challenged" },
                    ].map((opt) => (
                      <button
                        key={String(opt.value)}
                        type="button"
                        onClick={() => set("balancedDifficulty", opt.value)}
                        className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
                          form.balancedDifficulty === opt.value
                            ? "border-hub-cyan/50 bg-hub-cyan/15 text-hub-cyan"
                            : "border-white/[0.1] bg-white/[0.03] text-hub-text-secondary hover:border-white/[0.2] hover:text-hub-text"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Skill focus */}
                <ChipGroup
                  label="Skill focus"
                  options={SKILL_OPTIONS}
                  value={form.skillFocus}
                  onChange={(v) => set("skillFocus", v)}
                />

                {/* Transit profile */}
                <ChipGroup
                  label="Campus travel style"
                  options={TRANSIT_OPTIONS}
                  value={form.transitProfile}
                  onChange={(v) => set("transitProfile", v)}
                />

                {/* Free-text fields */}
                {(
                  [
                    { key: "careerGoals", label: "Career goals", placeholder: "e.g. Software Engineering, Dentist, Professor" },
                    { key: "currentWorries", label: "Current worries", placeholder: "e.g. Math 103B workload" },
                    { key: "externalCommitments", label: "External commitments", placeholder: "e.g. Working 15 hrs/week" },
                  ] as const
                ).map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label
                      htmlFor={`briefing-${key}`}
                      className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-hub-text-muted"
                    >
                      {label}
                    </label>
                    <textarea
                      id={`briefing-${key}`}
                      rows={2}
                      value={form[key]}
                      onChange={(e) => set(key, e.target.value)}
                      placeholder={placeholder}
                      className="w-full resize-none rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-hub-text placeholder-hub-text-muted/60 outline-none transition focus:border-hub-cyan/40 focus:bg-white/[0.06]"
                    />
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-4 py-3">
                <button
                  type="button"
                  onClick={handleSkip}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-hub-text-secondary transition hover:text-hub-text"
                >
                  Skip for now
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-hub-cyan px-3.5 py-1.5 text-xs font-semibold text-hub-bg transition hover:bg-hub-cyan/85"
                >
                  Begin →
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
