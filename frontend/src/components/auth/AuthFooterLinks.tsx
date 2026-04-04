"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

type AuthFooterLinksProps = {
  variant: "login" | "signup";
};

export function AuthFooterLinks({ variant }: AuthFooterLinksProps) {
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : "";

  if (variant === "login") {
    return (
      <p className="mt-6 text-center text-sm text-hub-text-muted">
        Need an account?{" "}
        <Link
          href={`/signup${nextQuery}`}
          className="font-medium text-hub-cyan hover:underline"
        >
          Create account
        </Link>
      </p>
    );
  }

  return (
    <p className="mt-6 text-center text-sm text-hub-text-muted">
      Already have an account?{" "}
      <Link
        href={`/login${nextQuery}`}
        className="font-medium text-hub-cyan hover:underline"
      >
        Sign in
      </Link>
    </p>
  );
}
