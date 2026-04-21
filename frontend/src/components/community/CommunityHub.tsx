"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { motion } from "framer-motion";
import {
  PlusCircle,
  Search,
  X,
  Users,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  ChevronDown,
} from "lucide-react";
import { listPosts, getDepartments } from "@/lib/api/community";
import type { PostListResponse, PostSummary, SortBy } from "@/types/community";
import { CreatePostModal } from "./CreatePostModal";
import { PostCard } from "./PostCard";

type CommunityHubProps = {
  initialPosts: PostSummary[];
  initialTotal: number;
  userId: string;
};

export function CommunityHub({ initialPosts, initialTotal, userId }: CommunityHubProps) {
  const [posts, setPosts] = useState<PostSummary[]>(initialPosts);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);

  // Search + sort
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("newest");

  // Department / course filter
  const [filterOpen, setFilterOpen] = useState(false);
  const [departments, setDepartments] = useState<string[]>([]);
  const [deptStep, setDeptStep] = useState<"dept" | "course">("dept");
  const [pendingDept, setPendingDept] = useState("");
  const [pendingCourse, setPendingCourse] = useState("");
  const [activeDept, setActiveDept] = useState("");
  const [activeCourse, setActiveCourse] = useState("");

  const filterRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasActiveFilter = activeDept || activeCourse || activeSearch;

  // Close filter dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Fetch departments once when filter opens
  useEffect(() => {
    if (filterOpen && departments.length === 0) {
      getDepartments().then(setDepartments).catch(() => {});
    }
  }, [filterOpen, departments.length]);

  function fetchPosts(opts: {
    search?: string;
    sortBy?: SortBy;
    department?: string;
    courseNumber?: string;
    page: number;
  }) {
    startTransition(async () => {
      try {
        const data: PostListResponse = await listPosts(opts);
        setPosts(data.posts);
        setTotal(data.total);
        setPage(data.page);
      } catch {
        // keep current state on error
      }
    });
  }

  function applySearch() {
    const s = searchInput.trim();
    setActiveSearch(s);
    fetchPosts({ search: s || undefined, sortBy, department: activeDept || undefined, courseNumber: activeCourse || undefined, page: 1 });
  }

  function handleSortChange(s: SortBy) {
    setSortBy(s);
    fetchPosts({ search: activeSearch || undefined, sortBy: s, department: activeDept || undefined, courseNumber: activeCourse || undefined, page: 1 });
  }

  function applyDeptFilter() {
    setActiveDept(pendingDept);
    setActiveCourse(pendingCourse);
    setFilterOpen(false);
    setDeptStep("dept");
    fetchPosts({ search: activeSearch || undefined, sortBy, department: pendingDept || undefined, courseNumber: pendingCourse || undefined, page: 1 });
  }

  function clearFilter() {
    setSearchInput("");
    setActiveSearch("");
    setPendingDept("");
    setPendingCourse("");
    setActiveDept("");
    setActiveCourse("");
    setDeptStep("dept");
    fetchPosts({ sortBy, page: 1 });
  }

  function handlePostCreated(post: PostSummary) {
    setPosts((prev) => [post, ...prev]);
    setTotal((t) => t + 1);
  }

  function handlePostDeleted(postId: string) {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setTotal((t) => Math.max(0, t - 1));
  }

  return (
    <div className="w-full px-8 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-hub-cyan" />
            <h1 className="text-2xl font-bold text-hub-text">Community</h1>
          </div>
          <div className="mt-0.5 h-px w-24 bg-gradient-to-r from-hub-cyan/60 to-transparent" />
          <p className="mt-1 text-sm text-hub-text-muted">
            Ask questions and share insights with other Tritons
          </p>
          <p className="mt-0.5 text-xs text-hub-text-muted">
            {total} {total === 1 ? "discussion" : "discussions"}
          </p>
        </div>
        <CreatePostModal
          trigger={
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-hub-cyan px-4 text-sm font-medium text-hub-bg transition hover:brightness-110"
            >
              <PlusCircle className="h-4 w-4" />
              New Post
            </button>
          }
          onCreated={handlePostCreated}
          userId={userId}
        />
      </div>

      {/* Search + sort + filter row */}
      <div className="mb-5 flex flex-col gap-3">
        {/* Sort pills */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-hub-text-muted">Sort:</span>
          {(["newest", "best"] as SortBy[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSortChange(s)}
              className={`h-7 rounded-full px-3 text-xs font-medium capitalize transition ${
                sortBy === s
                  ? "bg-hub-cyan/20 text-hub-cyan"
                  : "bg-white/[0.06] text-hub-text-muted hover:bg-white/[0.1] hover:text-hub-text"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Search bar + filter button */}
        <div className="flex gap-2">
          {/* Search */}
          <div className="relative flex flex-1 items-center">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-hub-text-muted" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault(); // no implicit submit
              }}
              placeholder="Search within community"
              className="h-9 w-full rounded-lg border border-white/[0.08] bg-hub-bg/80 pl-9 pr-3 text-sm text-hub-text outline-none ring-hub-cyan/40 placeholder:text-hub-text-muted focus:border-hub-cyan/40 focus:ring-2"
            />
          </div>
          <button
            type="button"
            onClick={applySearch}
            className="h-9 rounded-lg border border-hub-cyan/30 bg-hub-cyan/10 px-4 text-sm font-medium text-hub-cyan transition hover:bg-hub-cyan/20"
          >
            Search
          </button>

          {/* Department/course filter */}
          <div className="relative" ref={filterRef}>
            <button
              type="button"
              onClick={() => {
                setFilterOpen((v) => !v);
                setDeptStep("dept");
              }}
              className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition ${
                activeDept
                  ? "border-hub-cyan/40 bg-hub-cyan/10 text-hub-cyan"
                  : "border-white/[0.08] bg-hub-bg/80 text-hub-text-muted hover:text-hub-text"
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {activeDept
                ? `${activeDept}${activeCourse ? ` ${activeCourse}` : ""}`
                : "Filter"}
              <ChevronDown className={`h-3.5 w-3.5 transition ${filterOpen ? "rotate-180" : ""}`} />
            </button>

            {filterOpen && (
              <div className="absolute right-0 top-full z-30 mt-1.5 w-64 rounded-xl border border-white/[0.1] bg-hub-surface-elevated shadow-xl">
                {deptStep === "dept" ? (
                  <>
                    <div className="border-b border-white/[0.06] px-3 py-2.5">
                      <p className="text-xs font-medium text-hub-text-secondary">Select department</p>
                    </div>
                    <div className="max-h-56 overflow-y-auto hub-scroll py-1">
                      {departments.length === 0 ? (
                        <p className="px-3 py-4 text-xs text-hub-text-muted text-center">No departments yet</p>
                      ) : (
                        departments.map((dept) => (
                          <button
                            key={dept}
                            type="button"
                            onClick={() => {
                              setPendingDept(dept);
                              setPendingCourse("");
                              setDeptStep("course");
                            }}
                            className="flex w-full items-center justify-between px-3 py-2 text-sm text-hub-text-secondary transition hover:bg-white/[0.04] hover:text-hub-text"
                          >
                            {dept}
                            <ChevronDown className="-rotate-90 h-3.5 w-3.5 text-hub-text-muted" />
                          </button>
                        ))
                      )}
                    </div>
                    <div className="border-t border-white/[0.06] px-3 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPendingDept("");
                          setPendingCourse("");
                          applyDeptFilter();
                        }}
                        className="text-xs text-hub-text-muted hover:text-hub-danger transition"
                      >
                        Clear filter
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="border-b border-white/[0.06] px-3 py-2.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDeptStep("dept")}
                        className="text-hub-text-muted hover:text-hub-text transition"
                      >
                        <ChevronDown className="h-4 w-4 rotate-90" />
                      </button>
                      <p className="text-xs font-medium text-hub-text-secondary">{pendingDept} — course number</p>
                    </div>
                    <div className="px-3 py-3">
                      <input
                        type="text"
                        value={pendingCourse}
                        onChange={(e) => setPendingCourse(e.target.value)}
                        placeholder="e.g. 110  (leave blank for all)"
                        className="h-8 w-full rounded-lg border border-white/[0.08] bg-hub-bg/80 px-3 text-sm text-hub-text outline-none ring-hub-cyan/40 placeholder:text-hub-text-muted focus:border-hub-cyan/40 focus:ring-2"
                        autoFocus
                      />
                    </div>
                    <div className="border-t border-white/[0.06] flex justify-end gap-2 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setFilterOpen(false)}
                        className="h-7 rounded-lg px-3 text-xs text-hub-text-muted hover:text-hub-text transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={applyDeptFilter}
                        className="h-7 rounded-lg bg-hub-cyan/20 px-3 text-xs font-medium text-hub-cyan transition hover:bg-hub-cyan/30"
                      >
                        Apply
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Clear all */}
          {hasActiveFilter && (
            <button
              type="button"
              onClick={clearFilter}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-white/[0.08] px-3 text-sm text-hub-text-muted transition hover:text-hub-danger"
              aria-label="Clear all filters"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>

        {/* Active filter chips */}
        {(activeDept || activeSearch) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {activeSearch && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs text-hub-text-muted">
                Search: <span className="text-hub-text-secondary">"{activeSearch}"</span>
              </span>
            )}
            {activeDept && (
              <span className="inline-flex items-center gap-1 rounded-full bg-hub-cyan/10 px-2.5 py-0.5 text-xs text-hub-cyan">
                {activeDept}{activeCourse ? ` ${activeCourse}` : ""}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Post list */}
      <motion.div
        className={`flex flex-col gap-3 transition-opacity ${isPending ? "opacity-40" : "opacity-100"}`}
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
      >
        {posts.length === 0 ? (
          <div className="glass-panel rounded-xl border border-white/[0.08] p-10 text-center">
            <p className="text-hub-text-secondary">No posts found.</p>
            <p className="mt-1 text-sm text-hub-text-muted">
              {hasActiveFilter ? "Try adjusting your search or filters." : "Be the first to start a discussion!"}
            </p>
          </div>
        ) : (
          posts.map((post) => (
            <motion.div
              key={post.id}
              variants={{
                hidden: { opacity: 0, y: 10 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } },
              }}
            >
              <PostCard post={post} currentUserId={userId} onDeleted={handlePostDeleted} />
            </motion.div>
          ))
        )}
      </motion.div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1 || isPending}
            onClick={() =>
              fetchPosts({
                search: activeSearch || undefined,
                sortBy,
                department: activeDept || undefined,
                courseNumber: activeCourse || undefined,
                page: page - 1,
              })
            }
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/[0.08] px-3 text-sm text-hub-text-secondary transition hover:text-hub-text disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </button>
          <span className="text-sm text-hub-text-muted">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || isPending}
            onClick={() =>
              fetchPosts({
                search: activeSearch || undefined,
                sortBy,
                department: activeDept || undefined,
                courseNumber: activeCourse || undefined,
                page: page + 1,
              })
            }
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/[0.08] px-3 text-sm text-hub-text-secondary transition hover:text-hub-text disabled:opacity-40"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
