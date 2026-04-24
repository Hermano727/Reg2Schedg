"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const resetRedirectTo = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`;
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSentTo(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const trimmed = email.trim().toLowerCase();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: resetRedirectTo,
      });
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setSentTo(trimmed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-outfit)] text-4xl font-semibold text-hub-text">
          Reset password
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-hub-text-secondary">
          Enter your account email and we&apos;ll send a secure reset link.
        </p>
      </div>

      <div className="glass-panel rounded-xl border border-white/[0.08] p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-hub-text-muted">
              Email
            </span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-11 w-full rounded-lg border border-white/[0.08] bg-hub-bg/50 px-3 text-sm text-hub-text outline-none ring-hub-cyan/40 placeholder:text-hub-text-muted focus:border-hub-cyan/40 focus:ring-2"
            />
          </label>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Sending..." : "Send reset link"}
          </Button>
        </form>

        {error ? <p className="mt-4 text-sm text-amber-200/90">{error}</p> : null}
        {sentTo ? (
          <p className="mt-4 text-sm text-hub-text-secondary">
            If an account exists for <span className="text-hub-text">{sentTo}</span>, a reset link is on the
            way. Check spam if you do not see it.
          </p>
        ) : null}
      </div>

      <p className="mt-6 text-center text-sm text-hub-text-muted">
        Remembered it?{" "}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-hub-cyan hover:underline">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}

