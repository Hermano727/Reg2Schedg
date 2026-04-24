import Link from "next/link";
import { Suspense } from "react";
import { AuthFooterLinks } from "@/components/auth/AuthFooterLinks";
import { AuthForm } from "@/components/auth/AuthForm";
import { PageHeader } from "@/components/ui/PageHeader";

export default function SignupPage() {
  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
      <PageHeader
        title="Create account"
        subtitle="For schedule analysis, create a UCSD email account or add a verified @ucsd.edu in your profile."
      />
      <Suspense
        fallback={
          <div className="h-40 animate-pulse rounded-xl bg-white/[0.04]" />
        }
      >
        <AuthForm intent="signup" />
      </Suspense>
      <Suspense fallback={null}>
        <AuthFooterLinks variant="signup" />
      </Suspense>
      <p className="mt-3 text-center text-sm text-hub-text-muted">
        <Link href="/" className="text-hub-text-secondary hover:text-hub-cyan hover:underline">
          Back to home
        </Link>
      </p>
    </main>
  );
}
