"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Anchor,
  ClipboardList,
  FileText,
  FolderArchive,
  GraduationCap,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { initialsFromName } from "@/lib/hub/initials";
import { vaultKindLabel } from "@/lib/hub/vault-map";
import type { VaultItem } from "@/types/dossier";
import type { PostSummary } from "@/types/community";

export type ProfilePlan = {
  id: string;
  title: string;
  quarter_label: string;
  status: string;
  updated_at: string;
};

export type ProfileQuarter = {
  label: string;
  planCount: number;
};

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: 0.06 * i,
      duration: 0.45,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  }),
};

type ProfileHubProps = {
  displayName: string;
  email: string;
  college: string | null;
  expectedGrad: string | null;
  plans: ProfilePlan[];
  quarters: ProfileQuarter[];
  vaultItems: VaultItem[];
  userPosts?: PostSummary[];
};

export function ProfileHub({
  displayName,
  email,
  college,
  expectedGrad,
  plans,
  quarters,
  vaultItems,
  userPosts = [],
}: ProfileHubProps) {
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <div className="relative mx-auto min-h-0 w-full max-w-5xl flex-1 overflow-y-auto px-4 py-8 pb-16 lg:px-8">
      {/* Chart grid: utilitarian "nav plot" without overwhelming the hub canvas */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        aria-hidden
        style={{
          backgroundImage: `
            linear-gradient(rgba(227, 177, 47, 0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 212, 255, 0.05) 1px, transparent 1px)
          `,
          backgroundSize: "56px 56px",
          maskImage:
            "linear-gradient(to bottom, black 0%, black 55%, transparent 100%)",
        }}
      />

      <motion.header
        custom={0}
        variants={fadeUp}
        initial="hidden"
        animate="show"
        className="relative mb-10 overflow-hidden rounded-2xl border border-white/[0.1] bg-gradient-to-br from-hub-surface via-hub-surface-elevated to-[#0d1f3a] shadow-[0_24px_80px_rgba(0,0,0,0.35)]"
        style={{ clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%)" }}
      >
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-hub-cyan/[0.07] blur-3xl" />
        <div className="absolute -bottom-20 -left-10 h-52 w-52 rounded-full bg-hub-gold/[0.06] blur-3xl" />

        <div className="relative flex flex-col gap-8 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
          <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-end">
            <div
              className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-hub-gold/35 bg-hub-bg/60 font-[family-name:var(--font-jetbrains-mono)] text-xl font-bold tracking-tight text-hub-gold shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              aria-hidden
            >
              {initials}
            </div>
            <div className="min-w-0">
              <p className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.2em] text-hub-cyan">
                Your profile
              </p>
              <h1 className="mt-1 font-[family-name:var(--font-outfit)] text-2xl font-semibold tracking-tight text-hub-text sm:text-3xl">
                {displayName}
              </h1>
              <p className="mt-1 truncate font-[family-name:var(--font-jetbrains-mono)] text-xs text-hub-text-muted">
                {email}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {college ? (
                  <span className="rounded-md border border-white/[0.1] bg-white/[0.04] px-2 py-1 font-[family-name:var(--font-jetbrains-mono)] text-[10px] uppercase tracking-wide text-hub-text-secondary">
                    {college}
                  </span>
                ) : null}
                {expectedGrad ? (
                  <span className="rounded-md border border-hub-cyan/25 bg-hub-cyan/10 px-2 py-1 font-[family-name:var(--font-jetbrains-mono)] text-[10px] uppercase tracking-wide text-hub-cyan">
                    Egress target · {expectedGrad}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Link
              href="/settings"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-white/[0.1] px-4 text-xs font-semibold text-hub-text-secondary transition hover:border-white/[0.18] hover:text-hub-text"
            >
              Settings
            </Link>
            <SignOutButton className="min-w-[8.5rem]" variant="danger" />
          </div>
        </div>
      </motion.header>

      <div className="relative grid gap-8 lg:grid-cols-12">
        <motion.section
          custom={1}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="lg:col-span-5"
        >
          <div className="flex items-center gap-2 border-b border-hub-gold/25 pb-3">
            <Anchor className="h-4 w-4 text-hub-gold" aria-hidden />
            <h2 className="font-[family-name:var(--font-outfit)] text-sm font-semibold uppercase tracking-[0.12em] text-hub-text">
              Saved quarters
            </h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-hub-text-secondary">
            Quarters tied to your saved command-center plans. Open the hub to
            load a snapshot.
          </p>
          <ul className="mt-5 space-y-3">
            {quarters.length === 0 ? (
              <li className="rounded-xl border border-dashed border-white/[0.12] bg-hub-bg/30 px-4 py-8 text-center">
                <p className="text-sm text-hub-text-muted">
                  No quarters yet. Upload a schedule on the home page while signed in to save your work.
                </p>
              </li>
            ) : (
              quarters.map((q) => (
                <li key={q.label}>
                  <Link
                    href="/"
                    className="group flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-hub-surface/60 px-4 py-3 transition hover:border-hub-cyan/30 hover:bg-hub-surface-elevated/80"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-[family-name:var(--font-outfit)] text-sm font-medium text-hub-text group-hover:text-hub-cyan">
                        {q.label}
                      </p>
                      <p className="mt-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] uppercase tracking-wide text-hub-text-muted">
                        {q.planCount} saved plan{q.planCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <span className="shrink-0 font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-hub-gold opacity-0 transition group-hover:opacity-100">
                      →
                    </span>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </motion.section>

        <motion.section
          custom={2}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="lg:col-span-7"
        >
          <div className="flex items-center gap-2 border-b border-hub-cyan/25 pb-3">
            <ClipboardList className="h-4 w-4 text-hub-cyan" aria-hidden />
            <h2 className="font-[family-name:var(--font-outfit)] text-sm font-semibold uppercase tracking-[0.12em] text-hub-text">
              Saved audit logs
            </h2>
            <span className="ml-auto rounded border border-white/[0.12] bg-white/[0.04] px-2 py-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[9px] font-medium uppercase tracking-wider text-hub-text-muted">
              Soon
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-hub-text-secondary">
            Degree-audit planner runs will appear here with timestamps, source
            PDFs, and resolution status.
          </p>
          <div className="mt-5 rounded-xl border border-white/[0.06] bg-hub-bg/40 p-6">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-hub-cyan/20 bg-hub-cyan/10">
                <GraduationCap className="h-6 w-6 text-hub-cyan" aria-hidden />
              </div>
              <p className="mt-4 font-[family-name:var(--font-outfit)] text-sm font-medium text-hub-text">
                No audit runs on file
              </p>
              <p className="mt-2 max-w-sm text-xs leading-relaxed text-hub-text-muted">
                When the degree planner ships, each proposed audit, diff against
                the portal, and "complete later" items will be listed here.
              </p>
            </div>
          </div>

          <div className="mt-8 flex items-center gap-2 border-b border-white/[0.08] pb-3">
            <Sparkles className="h-4 w-4 text-hub-text-muted" aria-hidden />
            <h2 className="font-[family-name:var(--font-outfit)] text-sm font-semibold uppercase tracking-[0.12em] text-hub-text">
              Saved plans
            </h2>
          </div>
          <ul className="mt-4 space-y-2">
            {plans.length === 0 ? (
              <li className="text-sm text-hub-text-muted">—</li>
            ) : (
              plans.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/?planId=${p.id}`}
                    className="flex flex-col rounded-lg border border-white/[0.06] bg-hub-bg/35 px-4 py-3 transition hover:border-white/[0.14]"
                  >
                    <span className="text-sm font-medium text-hub-text">
                      {p.title || "Untitled plan"}
                    </span>
                    <span className="mt-1 font-[family-name:var(--font-jetbrains-mono)] text-[10px] uppercase tracking-wide text-hub-text-muted">
                      {p.quarter_label || "—"} · {p.status} ·{" "}
                      {new Date(p.updated_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </motion.section>
      </div>

      {/* Resource vault */}
      <motion.section
        custom={3}
        variants={fadeUp}
        initial="hidden"
        animate="show"
        className="relative mt-10"
      >
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.1] pb-4">
          <div className="flex items-center gap-2">
            <FolderArchive className="h-5 w-5 text-hub-cyan" aria-hidden />
            <div>
              <h2 className="font-[family-name:var(--font-outfit)] text-sm font-semibold uppercase tracking-[0.12em] text-hub-text">
                Resource vault
              </h2>
              <p className="mt-1 max-w-xl text-xs text-hub-text-muted">
                Private uploads: syllabi, WebReg exports, and notes synced to
                your Supabase bucket.
              </p>
            </div>
          </div>
        </div>

        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {vaultItems.length === 0 ? (
            <li className="sm:col-span-2 rounded-xl border border-dashed border-white/[0.12] bg-hub-surface/40 px-4 py-12 text-center">
              <FileText
                className="mx-auto h-8 w-8 text-hub-text-muted"
                aria-hidden
              />
              <p className="mt-3 text-sm text-hub-text-muted">
                Vault is empty. Add files from the command center after ingest.
              </p>
            </li>
          ) : (
            vaultItems.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-3 rounded-xl border border-white/[0.08] bg-hub-surface/50 p-4 text-left transition hover:border-hub-cyan/25 hover:bg-hub-surface-elevated/60"
                >
                  <FileText
                    className="mt-0.5 h-4 w-4 shrink-0 text-hub-gold"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-hub-text">
                      {item.name}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] uppercase tracking-wide text-hub-text-muted">
                      <span>{vaultKindLabel(item.kind)}</span>
                      <span aria-hidden>·</span>
                      <span>Updated {item.updatedAt}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </motion.section>

      {/* My Posts */}
      <motion.section
        custom={4}
        variants={fadeUp}
        initial="hidden"
        animate="show"
        className="relative mt-10"
      >
        <div className="flex items-center gap-2 border-b border-hub-cyan/25 pb-3">
          <MessageSquare className="h-4 w-4 text-hub-cyan" aria-hidden />
          <h2 className="font-[family-name:var(--font-outfit)] text-sm font-semibold uppercase tracking-[0.12em] text-hub-text">
            My posts
          </h2>
          <span className="ml-auto font-[family-name:var(--font-jetbrains-mono)] text-xs text-hub-text-muted">
            {userPosts.length}
          </span>
        </div>

        <ul className="mt-4 space-y-2">
          {userPosts.length === 0 ? (
            <li className="rounded-xl border border-dashed border-white/[0.12] bg-hub-bg/30 px-4 py-8 text-center">
              <p className="text-sm text-hub-text-muted">
                No posts yet.{" "}
                <Link href="/community" className="text-hub-cyan underline underline-offset-2 transition hover:text-hub-cyan/80">
                  Start a discussion
                </Link>{" "}
                in the Community.
              </p>
            </li>
          ) : (
            userPosts.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/community/${p.id}`}
                  className="flex flex-col rounded-lg border border-white/[0.06] bg-hub-bg/35 px-4 py-3 transition hover:border-hub-cyan/25 hover:bg-hub-surface/60"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {p.courseCode && (
                      <span className="inline-flex items-center rounded-md bg-hub-cyan/10 px-1.5 py-0.5 text-[10px] font-medium text-hub-cyan">
                        {p.courseCode}
                      </span>
                    )}
                    {p.professorName && (
                      <span className="text-[10px] text-hub-text-muted">{p.professorName}</span>
                    )}
                    <span className="min-w-0 truncate text-sm font-medium text-hub-text">
                      {p.title}
                    </span>
                  </div>
                  <span className="mt-1 flex items-center gap-3 font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-hub-text-muted">
                    <span>{p.replyCount} {p.replyCount === 1 ? "reply" : "replies"}</span>
                    <span aria-hidden>·</span>
                    <span>{p.upvoteCount} {p.upvoteCount === 1 ? "upvote" : "upvotes"}</span>
                    <span aria-hidden>·</span>
                    <span>
                      {new Date(p.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    {p.isAnonymous && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="text-hub-text-muted/60">posted anonymously</span>
                      </>
                    )}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </motion.section>
    </div>
  );
}
