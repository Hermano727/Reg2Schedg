"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail } from "lucide-react";
import { GoogleIcon } from "@/components/icons/GoogleIcon";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

export type AuthFormIntent = "login" | "signup";

type AuthFormProps = {
  intent: AuthFormIntent;
};

function mapSignInError(raw: string): { primary: string; hintSignup: boolean } {
  const m = raw.toLowerCase();
  if (m.includes("email not confirmed") || m.includes("not been confirmed")) {
    return {
      primary:
        "This account is not active yet. Open the confirmation link in the email we sent when you signed up, then try signing in again.",
      hintSignup: true,
    };
  }
  if (m.includes("invalid login credentials") || m.includes("invalid credentials")) {
    return {
      primary:
        "Wrong email or password. If you have not created a password yet, use Create account first, or Continue with Google.",
      hintSignup: true,
    };
  }
  return { primary: raw, hintSignup: false };
}

function mapSignUpError(raw: string): string {
  const m = raw.toLowerCase();
  if (
    m.includes("already registered") ||
    m.includes("user already exists") ||
    m.includes("already been registered") ||
    (m.includes("email address") && m.includes("already")) ||
    m.includes("already in use") ||
    m.includes("duplicate")
  ) {
    return "That email is already on file. If you just signed up, check your inbox (and spam) for a confirmation link, then sign in. If you use Google for that address, use Continue with Google.";
  }
  return raw;
}

export function AuthForm({ intent }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const authError = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"idle" | "email" | "google">(
    "idle",
  );
  /** After successful email/password signup (when Supabase requires email confirmation). */
  const [signupEmailSentTo, setSignupEmailSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hintSignup, setHintSignup] = useState(false);
  const signupNoticeRef = useRef<HTMLDivElement>(null);

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const callbackUrl = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const loginWithNext = `/login?next=${encodeURIComponent(next)}`;
  const signupWithNext = `/signup?next=${encodeURIComponent(next)}`;
  const forgotWithNext = `/forgot-password?next=${encodeURIComponent(next)}`;

  useEffect(() => {
    if (!signupEmailSentTo) return;
    signupNoticeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [signupEmailSentTo]);

  async function signInWithOAuth(provider: "google") {
    setError(null);
    setSignupEmailSentTo(null);
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
    setSignupEmailSentTo(null);
    setHintSignup(false);
    setBusy("email");
    const supabase = createClient();

    if (intent === "signup") {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: callbackUrl,
        },
      });
      setBusy("idle");
      if (signUpError) {
        setError(mapSignUpError(signUpError.message));
        return;
      }
      // With "confirm email" (and related) enabled, GoTrue returns a fake user with
      // no identities when the address is already registered — no error, so we
      // must detect it here instead of showing a bogus "check your email" message.
      const identities = signUpData.user?.identities ?? [];
      if (signUpData.user && identities.length === 0) {
        setError(
          "That email is already tied to an account. If you are waiting on email confirmation, check your inbox first, then use Sign in. Otherwise try Continue with Google or Sign in with your password.",
        );
        return;
      }
      if (!signUpData.user && !signUpData.session) {
        setError(
          "We could not complete sign-up for that email. If you already use Google for this address, sign in with Google instead.",
        );
        return;
      }
      // Auto-confirm projects: Supabase returns a session immediately — treat like sign-in.
      if (signUpData.session) {
        setPassword("");
        router.refresh();
        router.push(next);
        return;
      }
      setSignupEmailSentTo(email.trim());
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
        <p className="text-sm font-medium text-hub-text">Google</p>
        <p className="mt-1 text-xs leading-relaxed text-hub-text-muted">
          Use this if your account was created with Google. If you use email/password, sign in below.
        </p>
      </>
    ) : (
      <>
        <p className="text-sm font-medium text-hub-text">Google</p>
        <p className="mt-1 text-xs leading-relaxed text-hub-text-muted">
          First time? Create an account!
        </p>
      </>
    );

  const emailIntro =
    intent === "login" ? (
      <p className="text-xs leading-relaxed text-hub-text-muted">
        <span className="text-hub-text-secondary">Email and password</span> only work if you set
        them on{" "}
        <Link href={signupWithNext} className="text-hub-cyan hover:underline">
          Create account
        </Link>
        . To upload WebReg schedules you will need a verified <span className="text-hub-text-secondary">@ucsd.edu</span> in{" "}
        <Link href="/profile" className="text-hub-cyan hover:underline">
          Profile
        </Link>
        .
      </p>
    ) : (
      <p className="text-xs leading-relaxed text-hub-text-muted">
        Pick any email and a password. For schedule analysis, create a UCSD email account or
        add a verified <span className="text-hub-text-secondary">@ucsd.edu</span> under{" "}
        <Link href="/profile" className="text-hub-cyan hover:underline">
          Profile → Link email
        </Link>
        .
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
          {authError === "ucsd_only"
            ? "That sign-in flow is no longer used. Please sign in again."
            : "Sign-in was interrupted. Try again."}
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
            placeholder="you@example.com"
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
        {!isSignup ? (
          <p className="text-right text-xs">
            <Link href={forgotWithNext} className="text-hub-cyan hover:underline">
              Forgot password?
            </Link>
          </p>
        ) : null}

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
                Create account
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      {signupEmailSentTo ? (
        <div
          ref={signupNoticeRef}
          className="mt-5 rounded-xl border border-hub-success/35 bg-hub-success/[0.09] px-4 py-4 text-left"
          role="status"
          aria-live="polite"
        >
          <div className="flex gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-hub-success/30 bg-hub-success/15 text-hub-success">
              <Mail className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-hub-success">Account created — one more step</p>
              <p className="mt-2 text-sm leading-relaxed text-hub-text-secondary">
                We sent a confirmation link to{" "}
                <span className="font-[family-name:var(--font-jetbrains-mono)] text-hub-text">
                  {signupEmailSentTo}
                </span>
                . Open that email (check spam), click the link, then come back here and sign in with
                the same password you just chose.
              </p>
              <p className="mt-3 text-center sm:text-left">
                <Link href={loginWithNext} className="text-sm font-medium text-hub-cyan hover:underline">
                  Go to Sign in →
                </Link>
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
