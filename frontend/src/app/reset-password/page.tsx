"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordSkeleton />}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const loginHref = useMemo(() => `/login?next=${encodeURIComponent(next)}`, [next]);

  useEffect(() => {
    let mounted = true;
    async function checkSession() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!mounted) return;
      setReady(Boolean(session));
      setChecking(false);
    }
    void checkSession();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setSuccess(true);
      setPassword("");
      setConfirmPassword("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <main className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
        <div className="glass-panel rounded-xl border border-white/[0.08] p-6">
          <p className="text-sm text-hub-text-secondary">Validating reset link...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-outfit)] text-4xl font-semibold text-hub-text">
          Set new password
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-hub-text-secondary">
          Choose a new password for your account.
        </p>
      </div>

      <div className="glass-panel rounded-xl border border-white/[0.08] p-6">
        {!ready ? (
          <div className="space-y-3">
            <p className="text-sm text-amber-200/90">
              This reset link is invalid or expired. Request a new one.
            </p>
            <Link href="/forgot-password" className="text-sm font-medium text-hub-cyan hover:underline">
              Request another reset email
            </Link>
          </div>
        ) : success ? (
          <div className="space-y-3">
            <p className="text-sm text-hub-text-secondary">
              Password updated. You can now sign in with your new password.
            </p>
            <Link href={loginHref} className="text-sm font-medium text-hub-cyan hover:underline">
              Go to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-hub-text-muted">
                New password
              </span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="h-11 w-full rounded-lg border border-white/[0.08] bg-hub-bg/50 px-3 text-sm text-hub-text outline-none ring-hub-cyan/40 placeholder:text-hub-text-muted focus:border-hub-cyan/40 focus:ring-2"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-hub-text-muted">
                Confirm new password
              </span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                className="h-11 w-full rounded-lg border border-white/[0.08] bg-hub-bg/50 px-3 text-sm text-hub-text outline-none ring-hub-cyan/40 placeholder:text-hub-text-muted focus:border-hub-cyan/40 focus:ring-2"
              />
            </label>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Saving..." : "Update password"}
            </Button>
          </form>
        )}

        {error ? <p className="mt-4 text-sm text-amber-200/90">{error}</p> : null}
      </div>
    </main>
  );
}

function ResetPasswordSkeleton() {
  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
      <div className="glass-panel rounded-xl border border-white/[0.08] p-6">
        <p className="text-sm text-hub-text-secondary">Validating reset link...</p>
      </div>
    </main>
  );
}

