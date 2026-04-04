"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GitBranch } from "lucide-react";
import { GoogleIcon } from "@/components/icons/GoogleIcon";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

export type AuthFormIntent = "login" | "signup";

type AuthFormProps = {
  intent: AuthFormIntent;
};

function mapSignInError(raw: string): { primary: string; hintSignup: boolean } {
  const m = raw.toLowerCase();
  if (
    m.includes("invalid login credentials") ||
    m.includes("invalid credentials") ||
    m.includes("email not confirmed")
  ) {
    return {
      primary:
        "That email and password did not work. Use an existing password, or create an account if you have not set one up yet.",
      hintSignup: true,
    };
  }
  return { primary: raw, hintSignup: false };
}

export function AuthForm({ intent }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const authError = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"idle" | "email" | "google" | "github">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hintSignup, setHintSignup] = useState(false);

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const callbackUrl = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const loginWithNext = `/login?next=${encodeURIComponent(next)}`;
  const signupWithNext = `/signup?next=${encodeURIComponent(next)}`;

  async function signInWithOAuth(provider: "google" | "github") {
    setError(null);
    setMessage(null);
    setHintSignup(false);
    setBusy(provider);
    const supabase = createClient();
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: callbackUrl,
      },
    });
    if (oauthError) {
      setBusy("idle");
      setError(oauthError.message);
      return;
    }
    if (data.url) {
      window.location.assign(data.url);
    } else {
      setBusy("idle");
      setError("Could not start sign-in. Try again.");
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setHintSignup(false);
    setBusy("email");
    const supabase = createClient();

    if (intent === "signup") {
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: callbackUrl,
        },
      });
      setBusy("idle");
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      setMessage(
        "Check your email to confirm your account if required, then sign in.",
      );
      setPassword("");
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy("idle");
    if (signInError) {
      const mapped = mapSignInError(signInError.message);
      setError(mapped.primary);
      setHintSignup(mapped.hintSignup);
      return;
    }
    router.refresh();
    router.push(next);
  }

  const isSignup = intent === "signup";

  const oauthIntro =
    intent === "login" ? (
      <>
        <p className="text-sm font-medium text-hub-text">Sign in with Google or GitHub</p>
        <p className="mt-1 text-xs leading-relaxed text-hub-text-muted">
          If you are new here, completing Google or GitHub sign-in{" "}
          <span className="text-hub-text-secondary">creates your TritonHub account</span>{" "}
          automatically. That is separate from email and password below, which only work
          after you have created a password on the Create account page.
        </p>
      </>
    ) : (
      <>
        <p className="text-sm font-medium text-hub-text">Create account with Google or GitHub</p>
        <p className="mt-1 text-xs leading-relaxed text-hub-text-muted">
          Your first successful sign-in with Google or GitHub{" "}
          <span className="text-hub-text-secondary">registers your account</span>. If you
          already use TritonHub with that provider, you will just be signed in.
        </p>
      </>
    );

  const emailIntro =
    intent === "login" ? (
      <p className="text-xs leading-relaxed text-hub-text-muted">
        For accounts that use a password only. Wrong email or password? Try{" "}
        <Link href={signupWithNext} className="text-hub-cyan hover:underline">
          Create account
        </Link>{" "}
        or use Google/GitHub above.
      </p>
    ) : (
      <p className="text-xs leading-relaxed text-hub-text-muted">
        Choose a password for email sign-in. This does not connect automatically to Google
        or GitHub; those stay separate unless you add linking in Supabase later.
      </p>
    );

  const divider = (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center" aria-hidden>
        <span className="w-full border-t border-white/[0.08]" />
      </div>
      <div className="relative flex justify-center text-[11px] uppercase tracking-wide">
        <span className="bg-hub-bg/80 px-3 text-hub-text-muted">
          {isSignup ? "Or register with email" : "Or sign in with email"}
        </span>
      </div>
    </div>
  );

  return (
    <div className="glass-panel rounded-xl border border-white/[0.08] p-6">
      {authError ? (
        <p className="mb-4 text-sm text-amber-200/90" role="alert">
          Sign-in was interrupted. Try again.
        </p>
      ) : null}

      <div className="mb-3">{oauthIntro}</div>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-center gap-2 border border-white/[0.1]"
          disabled={busy !== "idle"}
          onClick={() => void signInWithOAuth("google")}
        >
          <GoogleIcon className="h-4 w-4 shrink-0" />
          {busy === "google" ? "Redirecting…" : "Continue with Google"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-center gap-2 border border-white/[0.1]"
          disabled={busy !== "idle"}
          onClick={() => void signInWithOAuth("github")}
        >
          <GitBranch className="h-4 w-4 shrink-0 text-hub-text-muted" aria-hidden />
          {busy === "github" ? "Redirecting…" : "Continue with GitHub"}
        </Button>
      </div>

      {divider}

      <div className="mb-4">{emailIntro}</div>

      <form onSubmit={(e) => void handleEmailSubmit(e)} className="space-y-4">
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
            placeholder="you@ucsd.edu"
            className="h-11 w-full rounded-lg border border-white/[0.08] bg-hub-bg/50 px-3 text-sm text-hub-text outline-none ring-hub-cyan/40 placeholder:text-hub-text-muted focus:border-hub-cyan/40 focus:ring-2"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-hub-text-muted">
            Password
          </span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete={isSignup ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="h-11 w-full rounded-lg border border-white/[0.08] bg-hub-bg/50 px-3 text-sm text-hub-text outline-none ring-hub-cyan/40 placeholder:text-hub-text-muted focus:border-hub-cyan/40 focus:ring-2"
          />
        </label>

        <Button type="submit" className="w-full" disabled={busy !== "idle"}>
          {busy === "email"
            ? "Working…"
            : isSignup
              ? "Create account"
              : "Sign in"}
        </Button>
      </form>

      {error ? (
        <div className="mt-4 text-center text-sm text-amber-200/90" role="alert">
          <p>{error}</p>
          {hintSignup ? (
            <p className="mt-2 text-hub-text-secondary">
              <Link href={signupWithNext} className="text-hub-cyan hover:underline">
                Create account (email password)
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
      {message ? (
        <div className="mt-4 text-center text-sm text-hub-text-secondary" role="status">
          <p>{message}</p>
          <p className="mt-2">
            <Link href={loginWithNext} className="text-hub-cyan hover:underline">
              Go to Sign in
            </Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}
