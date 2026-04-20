import Link from "next/link";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

const linkGhost =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/[0.08] px-4 text-sm font-semibold text-hub-text-secondary transition hover:border-white/[0.14] hover:text-hub-text outline-none ring-hub-cyan/40 focus-visible:ring-2";
const linkPrimary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-hub-cyan/15 px-4 text-sm font-semibold text-hub-cyan ring-1 ring-hub-cyan/35 transition hover:bg-hub-cyan/25 outline-none focus-visible:ring-2 focus-visible:ring-hub-cyan/50";
import { createClient } from "@/lib/supabase/server";

function ToggleRow({
  id,
  label,
  description,
}: {
  id: string;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] py-4 last:border-0 last:pb-0">
      <div className="min-w-0">
        <label
          htmlFor={id}
          className="cursor-pointer font-medium text-hub-text"
        >
          {label}
        </label>
        <p className="mt-1 text-sm text-hub-text-muted">{description}</p>
      </div>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked="false"
        disabled
        className="relative h-7 w-12 shrink-0 rounded-full bg-white/[0.08] ring-1 ring-white/[0.1] transition before:absolute before:left-1 before:top-1 before:h-5 before:w-5 before:rounded-full before:bg-hub-text-muted/50 before:transition before:content-[''] disabled:opacity-50"
        title="Coming soon"
      />
    </div>
  );
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="relative mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto px-4 py-8 pb-12 lg:px-6">
      <PageHeader
        title="Settings"
        subtitle="Preferences and data controls. Toggles are UI-only until persistence exists."
      />

      <div className="space-y-6">
        {user ? (
          <Card
            title="Session"
            description="Sign out on this device. You’ll need to sign in again to sync plans and vault."
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <SignOutButton redirectTo="/login" variant="danger" />
              <Link href="/profile" className={linkGhost}>
                My profile
              </Link>
            </div>
          </Card>
        ) : (
          <Card
            title="Session"
            description="You’re browsing as a guest."
          >
            <Link href="/login?next=/settings" className={linkPrimary}>
              Sign in
            </Link>
          </Card>
        )}

        <Card
          title="Notifications"
          description="Email and in-app alerts for ingest completion and calendar conflicts."
        >
          <ToggleRow
            id="notify-ingest"
            label="Ingestion finished"
            description="When a schedule or syllabus run completes or fails."
          />
          <ToggleRow
            id="notify-calendar"
            label="Calendar conflicts"
            description="When synced events overlap or drift from WebReg."
          />
        </Card>

        <Card
          title="Appearance"
          description="Theme is fixed to command-deck dark for now."
        >
          <p className="text-sm text-hub-text-secondary">
            Light mode is not planned for the initial release.
          </p>
        </Card>
      </div>
    </main>
  );
}
