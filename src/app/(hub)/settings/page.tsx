import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

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
          className="font-medium text-hub-text cursor-pointer"
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

export default function SettingsPage() {
  return (
    <main className="relative mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto px-4 py-8 pb-12 lg:px-6">
      <PageHeader
        title="Settings"
        subtitle="Preferences and data controls. Toggles are UI-only until persistence exists."
      />

      <div className="space-y-6">
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
            Light mode is not planned for the initial release. Tokens live in{" "}
            <code className="rounded bg-hub-bg/80 px-1.5 py-0.5 font-mono text-xs text-hub-cyan">
              globals.css
            </code>
            .
          </p>
        </Card>

        <Card
          title="Data"
          description="Export and deletion will call FastAPI once accounts exist."
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button type="button" variant="ghost" disabled>
              Export my data
            </Button>
            <Button type="button" variant="danger" disabled>
              Delete account
            </Button>
          </div>
          <Alert variant="warn" className="mt-4" title="No backend yet">
            These actions will stay disabled until Supabase and your API enforce
            auth and data lifecycle.
          </Alert>
        </Card>
      </div>
    </main>
  );
}
