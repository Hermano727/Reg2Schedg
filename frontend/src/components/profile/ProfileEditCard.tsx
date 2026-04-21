"use client";

import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, MapPin, Briefcase, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getLearningStyles } from "@/lib/onboarding/learning-styles";
import { getConcernOptions } from "@/lib/onboarding/concerns";

// ---------------------------------------------------------------------------
// Same static lists as OnboardingFlow (kept in sync here)
// ---------------------------------------------------------------------------

const UCSD_MAJORS = [
  "Aerospace Engineering", "Bioengineering", "Chemical Engineering",
  "Computer Engineering", "Computer Science", "Computer Science (Bioinformatics)",
  "Data Science", "Electrical Engineering", "Environmental Engineering",
  "Mechanical Engineering", "Nanoengineering", "Structural Engineering",
  "Biology", "Biochemistry", "Bioinformatics", "Biophysics", "Chemistry",
  "Cognitive Science", "Ecology, Behavior & Evolution", "Environmental Science",
  "Human Biology", "Mathematics", "Mathematics-Computer Science", "Microbiology",
  "Molecular Biology", "Neuroscience", "Pharmacological Chemistry", "Physics",
  "Physiology & Neuroscience", "Anthropology", "Communication", "Economics",
  "Education Sciences", "Ethnic Studies", "Global Health", "International Studies",
  "Linguistics", "Political Science", "Psychology", "Public Health", "Sociology",
  "Urban Studies and Planning", "African American Studies", "Critical Gender Studies",
  "History", "Jewish Studies", "Latin American Studies", "Literature",
  "Middle Eastern Studies", "Music", "Philosophy", "Theatre", "Visual Arts",
  "Undeclared", "Other",
];

const CAREER_OPTIONS = [
  "Software Engineering", "Cybersecurity", "Research / Academia", "Product Management",
  "Data Engineering", "Machine Learning / AI", "Business Analytics",
  "Hardware Engineering", "Embedded Systems", "Signal Processing",
  "Industry / Private Sector", "Graduate School", "Medicine / Health", "Other",
];

const TRANSIT_OPTIONS = [
  { id: "walking", label: "Walking" },
  { id: "biking", label: "Biking" },
  { id: "scooter", label: "Scooter" },
  { id: "car", label: "Car" },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProfileData = {
  major: string | null;
  career_path: string | null;
  skill_preference: string | null;
  biggest_concerns: string[] | null;
  transit_mode: string | null;
  living_situation: string | null;
  commute_minutes: number | null;
  external_commitment_hours: number | null;
};

type Props = {
  userId: string;
  initial: ProfileData;
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-hub-text-muted">
      {children}
    </p>
  );
}

function ChipToggle({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all duration-150 outline-none",
        selected
          ? "border-hub-cyan/50 bg-hub-cyan/10 text-hub-cyan ring-1 ring-hub-cyan/30"
          : "border-white/[0.08] bg-white/[0.03] text-hub-text-secondary hover:border-white/[0.16] hover:text-hub-text",
      ].join(" ")}
    >
      {selected && <Check className="h-3 w-3 shrink-0" />}
      {children}
    </button>
  );
}

function MajorCombobox({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [query, setQuery] = useState(value ?? "");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = UCSD_MAJORS.filter((m) =>
    m.toLowerCase().includes(query.toLowerCase()),
  ).slice(0, 7);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function select(m: string) {
    onChange(m);
    setQuery(m);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-hub-text-muted" />
        <input
          type="text"
          placeholder="Search major…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); onChange(""); }}
          onFocus={() => setOpen(true)}
          className="w-full rounded-lg border border-white/[0.10] bg-white/[0.04] py-2.5 pl-9 pr-8 text-sm text-hub-text placeholder:text-hub-text-muted outline-none focus:border-hub-cyan/40 focus:ring-1 focus:ring-hub-cyan/20 transition"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(""); onChange(""); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-hub-text-muted hover:text-hub-text"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <AnimatePresence>
        {open && filtered.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-white/[0.10] bg-[#0d1f38] py-1 shadow-2xl"
          >
            {filtered.map((m) => (
              <li key={m}>
                <button
                  type="button"
                  onClick={() => select(m)}
                  className={[
                    "w-full px-4 py-2 text-left text-sm transition hover:bg-white/[0.06]",
                    m === value ? "text-hub-cyan" : "text-hub-text-secondary",
                  ].join(" ")}
                >
                  {m}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function SimpleSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-white/[0.10] bg-white/[0.04] py-2.5 pl-4 pr-9 text-sm text-hub-text outline-none focus:border-hub-cyan/40 focus:ring-1 focus:ring-hub-cyan/20 transition"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o} value={o} className="bg-[#0d1f38]">
            {o}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-hub-text-muted" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function validateProfile(form: ProfileData): string | null {
  if (!form.major) return "Please select your declared major.";
  if (!form.career_path) return "Please select a target career path.";
  if (!form.skill_preference) return "Please select a learning style.";
  if (!form.biggest_concerns?.length) return "Please select at least one concern.";
  if (!form.transit_mode) return "Please select your primary transit mode.";
  if (!form.living_situation) return "Please select your living situation.";
  if (
    form.living_situation === "off_campus" &&
    (form.commute_minutes == null || form.commute_minutes <= 0)
  )
    return "Please enter your commute time.";
  return null;
}

export function ProfileEditCard({ userId, initial }: Props) {
  const [form, setForm] = useState<ProfileData>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  function patch(p: Partial<ProfileData>) {
    setForm((f) => ({ ...f, ...p }));
    setSaved(false);
    setValidationError(null);
  }

  function toggleConcern(id: string) {
    const cur = form.biggest_concerns ?? [];
    const next = cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id];
    patch({ biggest_concerns: next });
  }

  useEffect(() => {
    const validConcernIds = new Set(getConcernOptions(form.major ?? "").map((opt) => opt.id));
    setForm((f) => ({
      ...f,
      biggest_concerns: (f.biggest_concerns ?? []).filter((id) => validConcernIds.has(id)),
    }));
  }, [form.major]);

  async function handleSave() {
    const err = validateProfile(form);
    if (err) {
      setValidationError(err);
      return;
    }
    setSaving(true);
    setValidationError(null);
    try {
      const supabase = createClient();
      await supabase.from("profiles").update({
        major: form.major || null,
        career_path: form.career_path || null,
        skill_preference: form.skill_preference || null,
        biggest_concerns: form.biggest_concerns?.length ? form.biggest_concerns : null,
        transit_mode: form.transit_mode || null,
        living_situation: form.living_situation || null,
        commute_minutes: form.commute_minutes ?? null,
        external_commitment_hours: form.external_commitment_hours ?? null,
      }).eq("id", userId);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 py-2">
      {/* Major */}
      <div>
        <FieldLabel>Declared Major</FieldLabel>
        <MajorCombobox value={form.major ?? ""} onChange={(v) => patch({ major: v || null })} />
      </div>

      {/* Career path */}
      <div>
        <FieldLabel>Target Career Path</FieldLabel>
        <SimpleSelect
          value={form.career_path ?? ""}
          onChange={(v) => patch({ career_path: v || null })}
          options={CAREER_OPTIONS}
          placeholder="Select a path…"
        />
      </div>

      {/* Skill preference — options are major-aware */}
      <div>
        <FieldLabel>Learning Style</FieldLabel>
        <div className="grid grid-cols-2 gap-2">
          {getLearningStyles(form.major ?? "").map(({ id, label, sub }) => (
            <button
              key={id}
              type="button"
              onClick={() => patch({ skill_preference: form.skill_preference === id ? null : id })}
              className={[
                "rounded-xl border p-3.5 text-left transition-all duration-150 outline-none",
                form.skill_preference === id
                  ? "border-hub-cyan/40 bg-hub-cyan/[0.07] ring-1 ring-hub-cyan/25"
                  : "border-white/[0.08] bg-white/[0.03] hover:border-white/[0.14]",
              ].join(" ")}
            >
              <p className="font-medium text-sm text-hub-text">{label}</p>
              {sub && <p className="mt-0.5 text-xs text-hub-text-muted">{sub}</p>}
            </button>
          ))}
        </div>
      </div>

      {/* Concerns */}
      <div>
        <FieldLabel>Biggest Concerns</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {getConcernOptions(form.major ?? "").map(({ id, label }) => (
            <ChipToggle
              key={id}
              selected={(form.biggest_concerns ?? []).includes(id)}
              onClick={() => toggleConcern(id)}
            >
              {label}
            </ChipToggle>
          ))}
        </div>
      </div>

      {/* Transit */}
      <div>
        <FieldLabel>Primary Transit</FieldLabel>
        <div className="flex gap-2">
          {TRANSIT_OPTIONS.map(({ id, label }) => (
            <ChipToggle
              key={id}
              selected={form.transit_mode === id}
              onClick={() => patch({ transit_mode: form.transit_mode === id ? null : id })}
            >
              {label}
            </ChipToggle>
          ))}
        </div>
      </div>

      {/* Living situation */}
      <div>
        <FieldLabel>Living Situation</FieldLabel>
        <div className="flex gap-3">
          {[
            { id: "on_campus", label: "On-Campus" },
            { id: "off_campus", label: "Off-Campus" },
          ].map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() =>
                patch({ living_situation: form.living_situation === id ? null : (id as "on_campus" | "off_campus") })
              }
              className={[
                "flex-1 rounded-xl border py-2.5 text-sm font-medium text-center transition-all duration-150 outline-none",
                form.living_situation === id
                  ? "border-hub-cyan/40 bg-hub-cyan/[0.07] text-hub-cyan ring-1 ring-hub-cyan/25"
                  : "border-white/[0.08] bg-white/[0.03] text-hub-text-secondary hover:border-white/[0.14] hover:text-hub-text",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        <AnimatePresence>
          {form.living_situation === "off_campus" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 overflow-hidden"
            >
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-hub-text-muted">
                Commute time
              </p>
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 shrink-0 text-hub-text-muted" />
                <div className="relative flex-1">
                  <input
                    type="number"
                    min={1}
                    max={180}
                    placeholder="0"
                    value={form.commute_minutes ?? ""}
                    onChange={(e) =>
                      patch({ commute_minutes: e.target.value === "" ? null : Number(e.target.value) })
                    }
                    className="w-full rounded-lg border border-white/[0.10] bg-white/[0.04] px-4 py-2.5 pr-16 text-sm text-hub-text placeholder:text-hub-text-muted outline-none focus:border-hub-cyan/40 focus:ring-1 focus:ring-hub-cyan/20 transition"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-hub-text-muted">
                    minutes
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* External hours */}
      <div>
        <FieldLabel>Weekly External Commitments</FieldLabel>
        <div className="flex items-center gap-3">
          <Briefcase className="h-4 w-4 shrink-0 text-hub-text-muted" />
          <div className="relative flex-1">
            <input
              type="number"
              min={0}
              max={60}
              placeholder="0"
              value={form.external_commitment_hours ?? ""}
              onChange={(e) =>
                patch({ external_commitment_hours: e.target.value === "" ? null : Number(e.target.value) })
              }
              className="w-full rounded-lg border border-white/[0.10] bg-white/[0.04] px-4 py-2.5 pr-12 text-sm text-hub-text placeholder:text-hub-text-muted outline-none focus:border-hub-cyan/40 focus:ring-1 focus:ring-hub-cyan/20 transition"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-hub-text-muted">
              hrs
            </span>
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="border-t border-white/[0.06] pt-4">
        {validationError && (
          <p className="mb-3 text-xs text-hub-danger">{validationError}</p>
        )}
        <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-hub-cyan/15 px-5 py-2.5 text-sm font-semibold text-hub-cyan ring-1 ring-hub-cyan/35 transition hover:bg-hub-cyan/25 disabled:opacity-50 outline-none"
        >
          {saving ? "Saving…" : "Save Profile"}
        </button>
        <AnimatePresence>
          {saved && (
            <motion.span
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 text-sm text-hub-success"
            >
              <Check className="h-4 w-4" />
              Saved
            </motion.span>
          )}
        </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
