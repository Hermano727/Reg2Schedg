"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import {
  AlertTriangle,
  Bike,
  BrainCircuit,
  BookOpen,
  Briefcase,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  FlaskConical,
  MapPin,
  Navigation,
  Search,
  Sigma,
  TrendingUp,
  X,
} from "lucide-react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { getLearningStyles } from "@/lib/onboarding/learning-styles";
import { getConcernOptions } from "@/lib/onboarding/concerns";

// ---------------------------------------------------------------------------
// Static data
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

const CAREER_PATHS: Record<string, string[]> = {
  "Computer Science": ["Software Engineering", "Cybersecurity", "Research / Academia", "Product Management", "Other"],
  "Data Science": ["Data Engineering", "Machine Learning / AI", "Research / Academia", "Business Analytics", "Other"],
  "Electrical Engineering": ["Hardware Engineering", "Embedded Systems", "Research / Academia", "Signal Processing", "Other"],
  default: ["Industry / Private Sector", "Research / Academia", "Graduate School", "Medicine / Health", "Other"],
};

const CONCERN_ICON_MAP: Record<string, React.ReactNode> = {
  workload: <BookOpen className="h-3.5 w-3.5" />,
  scheduling: <Clock className="h-3.5 w-3.5" />,
  commute: <Navigation className="h-3.5 w-3.5" />,
  gpa: <TrendingUp className="h-3.5 w-3.5" />,
  attendance: <ClipboardList className="h-3.5 w-3.5" />,
  heavy_math_load: <Sigma className="h-3.5 w-3.5" />,
  theoretical_classes: <BrainCircuit className="h-3.5 w-3.5" />,
  lab_scheduling: <FlaskConical className="h-3.5 w-3.5" />,
  ochem: <FlaskConical className="h-3.5 w-3.5" />,
  group_projects: <BookOpen className="h-3.5 w-3.5" />,
  reading_writing_intensity: <BookOpen className="h-3.5 w-3.5" />,
  discussion_heavy: <ClipboardList className="h-3.5 w-3.5" />,
};

// Inline SVGs for transit modes that have no Lucide equivalent
const WalkIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="4" r="1.5" />
    <path d="M9 8.5l1.5 4 2-2 2 4" />
    <path d="M8 20l2-5" />
    <path d="M14 11l2 9" />
  </svg>
);

const ScooterIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6"  cy="17" r="2.5" />
    <circle cx="18" cy="17" r="2.5" />
    <path d="M6 17h4l2-7h4" />
    <path d="M14 5h3l1 5" />
  </svg>
);

const TRANSIT_OPTIONS: { id: string; label: string; icon: React.ReactNode }[] = [
  { id: "walking", label: "Walking", icon: <WalkIcon /> },
  { id: "biking",  label: "Biking",  icon: <Bike className="h-5 w-5" /> },
  { id: "scooter", label: "Scooter", icon: <ScooterIcon /> },
  { id: "car",     label: "Car",     icon: <Car className="h-5 w-5" /> },
];

const SLIDE_COUNT = 4;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OnboardingData = {
  major: string;
  careerPath: string;
  skillPreference: string;
  concerns: string[];
  transitMode: string;
  livingSituation: "on_campus" | "off_campus" | "";
  commuteMinutes: number | "";
  externalHours: number | "";
};

type Props = {
  userId: string;
  onComplete: () => void;
};

// ---------------------------------------------------------------------------
// Slide animations
// ---------------------------------------------------------------------------

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 48 : -48, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -48 : 48, opacity: 0 }),
};

const transition = { type: "tween" as const, ease: [0.22, 1, 0.36, 1] as const, duration: 0.3 };

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = ((current + 1) / total) * 100;
  return (
    <div className="absolute right-8 top-6 flex items-center gap-3">
      <span className="text-xs font-medium text-hub-text-muted">
        {current + 1} / {total}
      </span>
      <div className="h-1 w-24 overflow-hidden rounded-full bg-white/[0.08]">
        <motion.div
          className="h-full rounded-full bg-hub-cyan"
          animate={{ width: `${pct}%` }}
          transition={{ ease: "easeOut", duration: 0.4 }}
        />
      </div>
    </div>
  );
}

function ChipButton({
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
        "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all duration-150 outline-none",
        selected
          ? "border-hub-cyan/50 bg-hub-cyan/10 text-hub-cyan ring-1 ring-hub-cyan/30"
          : "border-white/[0.08] bg-white/[0.03] text-hub-text-secondary hover:border-white/[0.16] hover:text-hub-text",
      ].join(" ")}
    >
      {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-hub-text-muted">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Searchable major dropdown
// ---------------------------------------------------------------------------

function MajorSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = UCSD_MAJORS.filter((m) =>
    m.toLowerCase().includes(query.toLowerCase()),
  ).slice(0, 8);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function select(major: string) {
    onChange(major);
    setQuery(major);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-hub-text-muted" />
        <input
          type="text"
          placeholder="Search your major…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); onChange(""); }}
          onFocus={() => setOpen(true)}
          className="w-full rounded-xl border border-white/[0.10] bg-white/[0.04] py-3 pl-10 pr-10 text-sm text-hub-text placeholder:text-hub-text-muted outline-none focus:border-hub-cyan/40 focus:ring-1 focus:ring-hub-cyan/20 transition"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(""); onChange(""); setOpen(true); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-hub-text-muted hover:text-hub-text"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {open && filtered.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-white/[0.10] bg-[#0d1f38] py-1 shadow-2xl"
          >
            {filtered.map((m) => (
              <li key={m}>
                <button
                  type="button"
                  onClick={() => select(m)}
                  className={[
                    "w-full px-4 py-2.5 text-left text-sm transition hover:bg-white/[0.06]",
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

// ---------------------------------------------------------------------------
// Preview radar (slide 4)
// ---------------------------------------------------------------------------

function PreviewRadar({ data }: { data: OnboardingData }) {
  const hasAnyConcern = (...ids: string[]) => ids.some((id) => data.concerns.includes(id));

  const workload =
    hasAnyConcern("workload")
      ? 8
      : hasAnyConcern("heavy_math_load", "math", "ochem", "reading_writing_intensity")
        ? 7
        : 5;
  const commute =
    data.livingSituation === "off_campus"
      ? Math.min(10, Math.round((Number(data.commuteMinutes) || 20) / 6))
      : data.transitMode === "walking" ? 3 : 4;
  const scheduling = hasAnyConcern("scheduling", "lab_scheduling", "group_projects") ? 8 : 5;
  const gpaRisk = data.concerns.includes("gpa") ? 7 : 4;
  const balance =
    Number(data.externalHours) >= 15 ? 8 : Number(data.externalHours) >= 8 ? 6 : 3;

  const radarData = [
    { subject: "Workload", value: workload, fullMark: 10 },
    { subject: "Schedule Fit", value: scheduling, fullMark: 10 },
    { subject: "Commute Load", value: commute, fullMark: 10 },
    { subject: "GPA Risk", value: gpaRisk, fullMark: 10 },
    { subject: "Life Balance", value: balance, fullMark: 10 },
  ];

  const avg = radarData.reduce((s, d) => s + d.value, 0) / radarData.length;
  const color = avg <= 4 ? "#5eead4" : "#e3b12f";

  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between">
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <RadarChart cx="50%" cy="50%" outerRadius="78%" data={radarData}>
          <PolarGrid stroke="rgba(255,255,255,0.07)" />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 600 }}
          />
          <Radar
            name="Profile"
            dataKey="value"
            stroke={color}
            fill={color}
            fillOpacity={0.2}
            strokeWidth={2}
            dot={{ r: 3.5, fill: color, strokeWidth: 0 }}
          />
        </RadarChart>
      </ResponsiveContainer>
      <p className="mt-1 text-center text-[13px] text-hub-text-muted">
        Closeness to the edge represents difficulty in that category.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slides
// ---------------------------------------------------------------------------

function Slide1({
  data,
  onChange,
}: {
  data: OnboardingData;
  onChange: (patch: Partial<OnboardingData>) => void;
}) {
  const careers = CAREER_PATHS[data.major] ?? CAREER_PATHS.default;

  return (
    <div className="space-y-7">
      <div>
        <SectionLabel>Declared Major</SectionLabel>
        <MajorSelect
          value={data.major}
          onChange={(major) => onChange({ major, careerPath: "" })}
        />
      </div>

      {data.major && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <SectionLabel>Target Career Path</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {careers.map((c) => (
              <ChipButton
                key={c}
                selected={data.careerPath === c}
                onClick={() => onChange({ careerPath: c })}
              >
                {c}
              </ChipButton>
            ))}
          </div>
        </motion.div>
      )}

      {data.careerPath && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <SectionLabel>Learning Preferences</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {getLearningStyles(data.major).map(({ id, label, sub }) => (
              <button
                key={id}
                type="button"
                onClick={() => onChange({ skillPreference: id })}
                className={[
                  "rounded-xl border p-3.5 text-left transition-all duration-150 outline-none",
                  data.skillPreference === id
                    ? "border-hub-cyan/40 bg-hub-cyan/[0.07] ring-1 ring-hub-cyan/25"
                    : "border-white/[0.08] bg-white/[0.03] hover:border-white/[0.14]",
                ].join(" ")}
              >
                <p className="font-semibold text-sm text-hub-text">{label}</p>
                {sub && <p className="mt-0.5 text-xs text-hub-text-muted">{sub}</p>}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

function Slide2({
  data,
  onChange,
}: {
  data: OnboardingData;
  onChange: (patch: Partial<OnboardingData>) => void;
}) {
  const concernOptions = getConcernOptions(data.major);

  function toggleConcern(id: string) {
    const next = data.concerns.includes(id)
      ? data.concerns.filter((c) => c !== id)
      : [...data.concerns, id];
    onChange({ concerns: next });
  }

  return (
    <div className="space-y-7">
      <div>
        <SectionLabel>Biggest Concerns</SectionLabel>
        <p className="mb-3 text-xs text-hub-text-muted">Select all that apply. Used to sharpen your schedule fitness score.</p>
        <div className="flex flex-wrap gap-2">
          {concernOptions.map(({ id, label }) => (
            <ChipButton
              key={id}
              selected={data.concerns.includes(id)}
              onClick={() => toggleConcern(id)}
            >
              {CONCERN_ICON_MAP[id] ?? <BookOpen className="h-3.5 w-3.5" />}
              {label}
            </ChipButton>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Primary Transit</SectionLabel>
        <div className="grid grid-cols-4 gap-2">
          {TRANSIT_OPTIONS.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onChange({ transitMode: id })}
              className={[
                "flex flex-col items-center gap-2 rounded-xl border py-3.5 text-sm font-medium transition-all duration-150 outline-none",
                data.transitMode === id
                  ? "border-hub-cyan/40 bg-hub-cyan/[0.07] text-hub-cyan ring-1 ring-hub-cyan/25"
                  : "border-white/[0.08] bg-white/[0.03] text-hub-text-secondary hover:border-white/[0.14] hover:text-hub-text",
              ].join(" ")}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Living Situation</SectionLabel>
        <div className="flex gap-3">
          {[
            { id: "on_campus", label: "On-Campus", sub: "Dorm or on-campus housing" },
            { id: "off_campus", label: "Off-Campus", sub: "Apartment, home, etc." },
          ].map(({ id, label, sub }) => (
            <button
              key={id}
              type="button"
              onClick={() => onChange({ livingSituation: id as "on_campus" | "off_campus" })}
              className={[
                "flex-1 rounded-xl border p-4 text-left transition-all duration-150 outline-none",
                data.livingSituation === id
                  ? "border-hub-cyan/40 bg-hub-cyan/[0.07] ring-1 ring-hub-cyan/25"
                  : "border-white/[0.08] bg-white/[0.03] hover:border-white/[0.14]",
              ].join(" ")}
            >
              <p className="font-semibold text-sm text-hub-text">{label}</p>
              <p className="mt-0.5 text-xs text-hub-text-muted">{sub}</p>
            </button>
          ))}
        </div>

        <AnimatePresence>
          {data.livingSituation === "off_campus" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <SectionLabel>Commute time</SectionLabel>
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 shrink-0 text-hub-text-muted" />
                <div className="relative flex-1">
                  <input
                    type="number"
                    min={1}
                    max={180}
                    placeholder="0"
                    value={data.commuteMinutes}
                    onChange={(e) =>
                      onChange({ commuteMinutes: e.target.value === "" ? "" : Number(e.target.value) })
                    }
                    className="w-full rounded-xl border border-white/[0.10] bg-white/[0.04] px-4 py-3 pr-20 text-sm text-hub-text placeholder:text-hub-text-muted outline-none focus:border-hub-cyan/40 focus:ring-1 focus:ring-hub-cyan/20 transition"
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

      <div>
        <SectionLabel>Weekly External Commitments</SectionLabel>
        <p className="mb-2 text-xs text-hub-text-muted">Jobs, research labs, intensive clubs, etc.</p>
        <div className="flex items-center gap-3">
          <Briefcase className="h-4 w-4 shrink-0 text-hub-text-muted" />
          <div className="relative flex-1">
            <input
              type="number"
              min={0}
              max={60}
              placeholder="0"
              value={data.externalHours}
              onChange={(e) =>
                onChange({ externalHours: e.target.value === "" ? "" : Number(e.target.value) })
              }
              className="w-full rounded-xl border border-white/[0.10] bg-white/[0.04] px-4 py-3 pr-12 text-sm text-hub-text placeholder:text-hub-text-muted outline-none focus:border-hub-cyan/40 focus:ring-1 focus:ring-hub-cyan/20 transition"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-hub-text-muted">
              hrs
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Slide3() {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 flex gap-3">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
        <p className="text-sm text-amber-200/80">
          Our app is optimized for WebReg&apos;s <strong>List View</strong>. The Calendar View does not display
          exam dates, losing important information for your analysis.
        </p>
      </div>

      {/* Two-column comparison — horizontal image gets more space since it's wider */}
      <div className="flex gap-5 items-start">

        {/* ── Preferred: horizontal list view (wider image) ── */}
        <div className="flex-[3] space-y-3 min-w-0">
          <div className="overflow-hidden rounded-xl border-2 border-hub-cyan/40 ring-1 ring-hub-cyan/20 shadow-xl">
            <Image
              src="/images/schedule1.png"
              alt="Horizontal list view — preferred"
              width={900}
              height={520}
              className="w-full object-cover"
              style={{ display: "block" }}
              priority
            />
          </div>
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-hub-cyan/15 ring-1 ring-hub-cyan/40">
              <Check className="h-3.5 w-3.5 text-hub-cyan" />
            </span>
            <div>
              <p className="text-[18px] font-bold text-hub-cyan">Use This View</p>
              <p className="text-[16px] text-hub-text-secondary mt-0.5 leading-relaxed">
                Horizontal list view: includes exam timings and full section detail for best analysis.
              </p>
              <p className="text-[16px] py-3 text-hub-text-muted pt-1">
                In WebReg: <strong className="text-hub-text-secondary">Take a screenshot OR print schedule → Save File</strong>.
              </p>
            </div>
          </div>
        </div>

        {/* ── Not preferred: vertical calendar view (taller, narrower image) ── */}
        <div className="flex-[2] space-y-3 min-w-0">
          <div className="overflow-hidden rounded-xl border border-white/[0.08] opacity-50">
            <Image
              src="/images/schedule2.png"
              alt="Vertical calendar view — not preferred"
              width={560}
              height={720}
              className="w-full object-cover grayscale"
              style={{ display: "block" }}
              priority
            />
          </div>
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.05] ring-1 ring-white/[0.12]">
              <X className="h-3.5 w-3.5 text-hub-text-muted" />
            </span>
            <div>
              <p className="text-[18px] font-semibold text-hub-cyan">Avoid This View</p>
              <p className="text-[16px] text-hub-text-muted mt-0.5 leading-relaxed">
                Vertical calendar view: missing exam info, leading to incomplete analysis.
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

function Slide4({ data }: { data: OnboardingData }) {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div>
          <p className="font-semibold text-hub-text">Your profile is set.</p>
          <p className="mt-1 text-sm text-hub-text-secondary">
            Every time you upload a schedule, this radar adapts to reflect your uploaded quarter.
          </p>
        </div>
      </div>

      <PreviewRadar data={data} />

      <div className="grid grid-cols-2 gap-3 text-xs">
        {[
          { label: "Major", value: data.major || "—" },
          { label: "Career", value: data.careerPath || "—" },
          { label: "Transit", value: data.transitMode ? data.transitMode.charAt(0).toUpperCase() + data.transitMode.slice(1) : "—" },
          {
            label: "Commute",
            value: data.livingSituation === "off_campus" && data.commuteMinutes
              ? `${data.commuteMinutes} min`
              : data.livingSituation === "on_campus" ? "On-campus" : "—",
          },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
            <p className="text-hub-text-muted mb-0.5">{label}</p>
            <p className="font-medium text-hub-text truncate">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function canAdvance(slide: number, data: OnboardingData): boolean {
  if (slide === 0) return !!data.major && !!data.careerPath && !!data.skillPreference;
  if (slide === 1) return data.concerns.length > 0 && !!data.transitMode && !!data.livingSituation;
  return true; // slides 2 & 3 have no blocking requirements
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const SLIDE_TITLES = [
  "Academic Identity",
  "Your Constraints",
  "What to Upload",
  "Results Preview",
];

const SLIDE_SUBTITLES = [
  "Help us personalize every schedule analysis to your goals.",
  "These details shape your workload fitness score and commute warnings.",
  "Ensure your first upload is successful.",
  "Here's how your profile will influence your results.",
];

export function OnboardingFlow({ userId, onComplete }: Props) {
  const [slide, setSlide] = useState(0);
  const [dir, setDir] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [data, setData] = useState<OnboardingData>({
    major: "",
    careerPath: "",
    skillPreference: "",
    concerns: [],
    transitMode: "",
    livingSituation: "",
    commuteMinutes: "",
    externalHours: "",
  });

  const patch = useCallback((p: Partial<OnboardingData>) => setData((d) => ({ ...d, ...p })), []);

  useEffect(() => {
    const validConcernIds = new Set(getConcernOptions(data.major).map((opt) => opt.id));
    setData((d) => ({
      ...d,
      concerns: d.concerns.filter((id) => validConcernIds.has(id)),
    }));
  }, [data.major]);

  function go(delta: number) {
    const next = slide + delta;
    if (next < 0 || next >= SLIDE_COUNT) return;
    setDir(delta);
    setSlide(next);
  }

  async function finish() {
    setSaving(true);
    setSaveError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("profiles").upsert({
        id: userId,
        major: data.major || null,
        career_path: data.careerPath || null,
        skill_preference: data.skillPreference || null,
        biggest_concerns: data.concerns.length ? data.concerns : null,
        transit_mode: data.transitMode || null,
        living_situation: data.livingSituation || null,
        commute_minutes: data.commuteMinutes !== "" ? Number(data.commuteMinutes) : null,
        external_commitment_hours: data.externalHours === "" ? 0 : Number(data.externalHours),
        onboarding_complete: true,
      });
      if (error) throw error;
      onComplete();
    } catch (err) {
      console.log("Failed to save onboarding data:", err);
      setSaveError(err instanceof Error ? err.message : "Failed to save. Please try again.");
      setSaving(false);
    }
  }

  const isLast = slide === SLIDE_COUNT - 1;
  const canGoNext = canAdvance(slide, data);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(10, 25, 47, 0.97)", backdropFilter: "blur(8px)" }}
    >
      {/* Card — widens on the image-comparison slide */}
      <motion.div
        animate={{ maxWidth: slide === 2 ? "900px" : "600px" }}
        transition={{ type: "tween" as const, ease: [0.22, 1, 0.36, 1] as const, duration: 0.35 }}
        className="relative w-full mx-4 rounded-2xl border border-white/[0.08] overflow-hidden"
        style={{ background: "#0d1f38", boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }}
      >
        {/* Progress bar */}
        <ProgressBar current={slide} total={SLIDE_COUNT} />

        {/* Content area */}
        <div className="px-8 pb-8 pt-10 min-h-[520px] flex flex-col">
          {/* Header */}
          <div className="mb-7">
            <motion.h2
              key={slide}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="text-[20pt] font-bold text-hub-text font-[family-name:var(--font-outfit)]"
            >
              {SLIDE_TITLES[slide]}
            </motion.h2>
            <motion.p
              key={`sub-${slide}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 }}
              className="mt-1.5 text-[14pt] text-hub-text-secondary"
            >
              {SLIDE_SUBTITLES[slide]}
            </motion.p>
          </div>

          {/* Slide content */}
          <div className="flex-1 overflow-y-auto pr-0.5">
            <AnimatePresence mode="wait" custom={dir}>
              <motion.div
                key={slide}
                custom={dir}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={transition}
              >
                {slide === 0 && <Slide1 data={data} onChange={patch} />}
                {slide === 1 && <Slide2 data={data} onChange={patch} />}
                {slide === 2 && <Slide3 />}
                {slide === 3 && <Slide4 data={data} />}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer nav */}
          <div className="mt-8 border-t border-white/[0.06] pt-5">
            {saveError && (
              <p className="mb-3 text-center text-xs text-hub-danger">{saveError}</p>
            )}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => go(-1)}
                disabled={slide === 0}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-hub-text-muted transition hover:text-hub-text disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>

              <button
                type="button"
                onClick={isLast ? finish : () => go(1)}
                disabled={!canGoNext || saving}
                className={[
                  "flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-150 outline-none disabled:pointer-events-none disabled:opacity-40",
                  isLast
                    ? "bg-hub-cyan text-[#0a192f] hover:bg-hub-cyan/90"
                    : "bg-hub-cyan/15 text-hub-cyan ring-1 ring-hub-cyan/35 hover:bg-hub-cyan/25",
                ].join(" ")}
              >
                {saving ? (
                  "Saving…"
                ) : isLast ? (
                  "Continue"
                ) : (
                  <>
                    Continue
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
