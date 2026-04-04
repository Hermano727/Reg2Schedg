import { Calendar } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";

export default function ProfilePage() {
  return (
    <main className="relative mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto px-4 py-8 pb-12 lg:px-6">
      <PageHeader
        title="My profile"
        subtitle="Your identity and connected services. Values are placeholders until Supabase and the API are wired."
      />

      <Alert variant="info" className="mb-6" title="Preview mode">
        Profile data is local-only for now. Nothing here is saved to a server.
      </Alert>

      <div className="space-y-6">
        <Card
          title="Account"
          description="How you appear in TritonHub after authentication."
        >
          <div className="space-y-4">
            <div>
              <label
                className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-hub-text-muted"
                htmlFor="display-name"
              >
                Display name
              </label>
              <input
                id="display-name"
                type="text"
                defaultValue="Guest user"
                disabled
                className="h-10 w-full max-w-md rounded-lg border border-white/[0.08] bg-hub-bg/50 px-3 text-sm text-hub-text-muted"
              />
            </div>
            <div>
              <label
                className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-hub-text-muted"
                htmlFor="email"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                defaultValue="you@ucsd.edu"
                disabled
                className="h-10 w-full max-w-md rounded-lg border border-white/[0.08] bg-hub-bg/50 px-3 text-sm text-hub-text-muted"
              />
            </div>
          </div>
        </Card>

        <Card
          title="UCSD context"
          description="Optional fields for tailoring dossiers and schedules."
        >
          <div className="space-y-4">
            <div>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-hub-text-muted">
                College / school
              </span>
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 max-w-md flex-1" />
                <span className="text-xs text-hub-text-muted">Loading…</span>
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-hub-text-muted">
                Expected graduation
              </span>
              <Skeleton className="h-10 max-w-xs" />
            </div>
          </div>
        </Card>

        <Card
          title="Connected accounts"
          description="OAuth and integrations managed via the API."
        >
          <EmptyState
            icon={Calendar}
            title="Google Calendar not connected"
            description="After OAuth, you’ll sync planned courses and key deadlines from the command center."
            action={{
              label: "Open settings",
              variant: "ghost",
              size: "sm",
              disabled: true,
            }}
          />
        </Card>
      </div>
    </main>
  );
}
