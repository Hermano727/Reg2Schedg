import Link from "next/link";
import { Suspense } from "react";
import { AuthFooterLinks } from "@/components/auth/AuthFooterLinks";
import { AuthForm } from "@/components/auth/AuthForm";
import { PageHeader } from "@/components/ui/PageHeader";

export default function LoginPage() {
  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
      <PageHeader
        title="Sign in"
        subtitle="Use Google, or the email and password you set on Create account. New here? Start with Create account or Google."
      />
      <Suspense
        fallback={
          <div className="h-40 animate-pulse rounded-xl bg-white/[0.04]" />
        }
      >
        <AuthForm intent="login" />
      </Suspense>
      <Suspense fallback={null}>
        <AuthFooterLinks variant="login" />
      </Suspense>
      <p className="mt-3 text-center text-sm text-hub-text-muted">
        <Link href="/" className="text-hub-text-secondary hover:text-hub-cyan hover:underline">
          Back to home
        </Link>
      </p>
    </main>
  );
}
