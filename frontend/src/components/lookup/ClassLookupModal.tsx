"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, ChevronLeft, Loader2, MessageSquarePlus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  searchCourseCache,
  expandCacheEntry,
  researchCourseByText,
  type CourseLookupSearchResult,
} from "@/lib/api/parse";
import { courseResearchResultToDossier } from "@/lib/mappers/courseEntryToDossier";
import { CourseJourneyPage } from "@/components/dashboard/DossierDashboardModal";
import type { ClassDossier } from "@/types/dossier";

type Phase = "search" | "results" | "dossier";

type Props = {
  open: boolean;
  onClose: () => void;
  initialQuery?: string;
  initialProfessorName?: string;
  autoSearchOnOpen?: boolean;
};

export function ClassLookupModal({
  open,
  onClose,
  initialQuery = "",
  initialProfessorName = "",
  autoSearchOnOpen = false,
}: Props) {
  const router = useRouter();
  const [courseCode, setCourseCode] = useState(initialQuery);
  const [professorName, setProfessorName] = useState("");
  const [phase, setPhase] = useState<Phase>("search");
  // Three distinct loading flags so TypeScript doesn't conflate them
  const [searching, setSearching] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [researching, setResearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CourseLookupSearchResult[]>([]);
  const [dossier, setDossier] = useState<ClassDossier | null>(null);
  const courseInputRef = useRef<HTMLInputElement>(null);
  const initialProfessorNameRef = useRef(initialProfessorName);
  const autoSearchRunKeyRef = useRef<string | null>(null);

  useEffect(() => {
    initialProfessorNameRef.current = initialProfessorName;
  }, [initialProfessorName]);

  useEffect(() => {
    if (open) {
      setCourseCode(initialQuery);
      setProfessorName(initialProfessorNameRef.current);
      setPhase("search");
      setSearching(false);
      setExpanding(false);
      setResearching(false);
      setError(null);
      setResults([]);
      setDossier(null);
      autoSearchRunKeyRef.current = null;
      setTimeout(() => courseInputRef.current?.focus(), 60);
    }
  }, [open, initialQuery]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (phase === "dossier") { setPhase("results"); return; }
        if (phase === "results") { setPhase("search"); return; }
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, phase, onClose]);

  async function runSearch(code: string, professor?: string) {
    if (!code) return;
    setSearching(true);
    setError(null);
    try {
      const found = await searchCourseCache(code, professor);
      setResults(found);
      setPhase("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function handleSearch(e: { preventDefault(): void }) {
    e.preventDefault();
    await runSearch(courseCode.trim(), professorName.trim() || undefined);
  }

  useEffect(() => {
    if (!open || !autoSearchOnOpen) return;
    const course = initialQuery.trim();
    if (!course) return;
    const professor = initialProfessorNameRef.current.trim();
    const key = `${course.toLowerCase()}::${professor.toLowerCase()}`;
    if (autoSearchRunKeyRef.current === key) return;
    autoSearchRunKeyRef.current = key;
    void runSearch(course, professor || undefined);
  }, [open, autoSearchOnOpen, initialQuery]);

  async function handleSelectResult(result: CourseLookupSearchResult) {
    setExpanding(true);
    setError(null);
    try {
      const full = await expandCacheEntry(result.cache_id);
      setDossier(courseResearchResultToDossier(full));
      setPhase("dossier");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load course");
    } finally {
      setExpanding(false);
    }
  }

  async function handleResearch() {
    setResearching(true);
    setError(null);
    try {
      const full = await researchCourseByText(courseCode.trim(), professorName.trim() || undefined);
      setDossier(courseResearchResultToDossier(full));
      setPhase("dossier");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Research failed");
    } finally {
      setResearching(false);
    }
  }

  function handleCreatePostAboutCourse() {
    if (!dossier) return;
    const params = new URLSearchParams();
    params.set("composeCourse", dossier.courseCode);
    if (dossier.professorName !== "TBA") {
      params.set("composeProfessor", dossier.professorName);
    }
    onClose();
    router.push(`/community?${params.toString()}`);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="lookup-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[75] bg-black/50 backdrop-blur-[2px]"
            onClick={onClose}
          />

          <motion.div
            key="lookup-panel"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            className="fixed inset-x-0 top-[4vh] z-[76] mx-auto flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-hub-surface shadow-[0_32px_80px_rgba(0,0,0,0.7)]"
            style={{ maxHeight: "92vh" }}
          >
            {/* ── Search bar (always visible) ── */}
            <div className="shrink-0 border-b border-white/[0.07] px-6 py-4">
              <form onSubmit={handleSearch} className="flex items-center gap-3">
                {phase !== "search" && (
                  <button
                    type="button"
                    onClick={() => setPhase(phase === "dossier" ? "results" : "search")}
                    className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg text-white/40 hover:text-white/70 transition"
                    aria-label="Back"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                )}
                <div className="flex flex-1 items-center gap-3 rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2.5 focus-within:border-hub-cyan/40 transition-colors">
                  <Search className="h-4 w-4 shrink-0 text-white/40" aria-hidden />
                  <input
                    ref={courseInputRef}
                    type="text"
                    value={courseCode}
                    onChange={(e) => setCourseCode(e.target.value)}
                    placeholder="Course code — e.g. CSE 101, MATH 20C..."
                    className="flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/30 outline-none min-w-0"
                  />
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2.5 focus-within:border-hub-cyan/40 transition-colors w-52">
                  <input
                    type="text"
                    value={professorName}
                    onChange={(e) => setProfessorName(e.target.value)}
                    placeholder="Professor (optional)"
                    className="flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/30 outline-none min-w-0"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!courseCode.trim() || searching}
                  className="shrink-0 rounded-lg bg-hub-cyan px-5 py-2.5 text-sm font-semibold text-hub-bg transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg text-white/40 hover:text-white/70 transition"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </form>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto">
              {/* Initial idle */}
              {phase === "search" && !searching && (
                <div className="flex flex-col items-center justify-center gap-3 py-20 text-white/30">
                  <Search className="h-10 w-10 opacity-30" />
                  <p className="text-sm">Enter a course code to see all cached professors and grade data.</p>
                </div>
              )}

              {/* Searching spinner */}
              {phase === "search" && searching && (
                <div className="flex flex-col items-center justify-center gap-4 py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-hub-cyan/60" />
                  <p className="text-sm text-white/40">Searching for {courseCode.trim()}…</p>
                </div>
              )}

              {/* Results list */}
              {phase === "results" && (
                <div className="px-6 py-4">
                  {expanding && (
                    <div className="flex flex-col items-center justify-center gap-4 py-16">
                      <Loader2 className="h-8 w-8 animate-spin text-hub-cyan/60" />
                      <p className="text-sm text-white/40">Loading dossier…</p>
                    </div>
                  )}

                  {!expanding && results.length === 0 && (
                    <div className="flex flex-col items-center gap-4 py-16">
                      <p className="text-sm text-white/50">
                        No cached data found for{" "}
                        <span className="text-white/80">{courseCode.trim()}</span>
                        {professorName.trim() ? ` / ${professorName.trim()}` : ""}.
                      </p>
                      <p className="text-xs text-white/30">
                        Run a full research pass to pull professor ratings, grades, and student insights.
                      </p>
                      <button
                        type="button"
                        onClick={handleResearch}
                        disabled={researching}
                        className="flex items-center gap-2 rounded-lg bg-hub-cyan/10 border border-hub-cyan/30 px-5 py-2.5 text-sm font-medium text-hub-cyan transition hover:bg-hub-cyan/20 disabled:opacity-40"
                      >
                        {researching ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <BookOpen className="h-4 w-4" />
                        )}
                        Research {courseCode.trim()}
                        {professorName.trim() ? ` / ${professorName.trim()}` : ""}
                      </button>
                      {error && <p className="text-xs text-hub-danger">{error}</p>}
                    </div>
                  )}

                  {!expanding && results.length > 0 && (
                    <>
                      <p className="mb-3 text-xs text-white/40">
                        {results.length} {results.length === 1 ? "entry" : "entries"} for{" "}
                        <span className="text-white/70">{results[0].course_code}</span>
                        {". "}Select a professor to view the full dossier
                      </p>
                      <div className="grid gap-2">
                        {results.map((r) => (
                          <button
                            key={r.cache_id}
                            type="button"
                            onClick={() => handleSelectResult(r)}
                            className="group flex w-full items-center gap-4 rounded-xl border border-white/[0.07] bg-white/[0.02] px-5 py-4 text-left transition hover:border-hub-cyan/30 hover:bg-hub-cyan/[0.05]"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] font-[family-name:var(--font-outfit)] text-sm font-semibold text-hub-cyan/80">
                              {(r.professor_name !== "TBA" ? r.professor_name : r.course_code)
                                .split(/[\s,]+/)
                                .filter(Boolean)
                                .slice(0, 2)
                                .map((w) => w[0]?.toUpperCase())
                                .join("")}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-medium text-white/90">
                                {r.professor_name !== "TBA" ? r.professor_name : "Unknown professor"}
                              </span>
                              <span className="block text-xs text-white/40">
                                {r.course_title ?? r.course_code}
                              </span>
                            </span>
                            <ChevronLeft className="h-4 w-4 shrink-0 rotate-180 text-white/20 transition group-hover:text-hub-cyan/60" />
                          </button>
                        ))}
                      </div>
                      {error && <p className="mt-3 text-xs text-hub-danger">{error}</p>}
                    </>
                  )}
                </div>
              )}

              {/* Full dossier */}
              {phase === "dossier" && dossier && (
                <CourseJourneyPage dossier={dossier} />
              )}
            </div>

            {/* ── Create post footer ── */}
            {phase === "dossier" && dossier && (
              <div className="shrink-0 flex items-center justify-end gap-3 border-t border-white/[0.06] px-6 py-3">
                <span className="flex-1 text-xs text-white/30">
                  Have experience with {dossier.courseCode}? Share it with other students.
                </span>
                <button
                  type="button"
                  onClick={handleCreatePostAboutCourse}
                  className="flex items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.05] px-4 py-2 text-sm text-white/70 transition hover:border-hub-cyan/30 hover:bg-hub-cyan/10 hover:text-hub-cyan"
                >
                  <MessageSquarePlus className="h-4 w-4" />
                  Create post about this course
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
