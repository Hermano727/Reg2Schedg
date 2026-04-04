import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/Button";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string } & Omit<ButtonProps, "children">;
  children?: ReactNode;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  children,
}: EmptyStateProps) {
  const { label: actionLabel, ...actionButtonProps } = action ?? {};

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.12] bg-hub-surface/40 px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-hub-cyan/10 ring-1 ring-hub-cyan/25">
        <Icon className="h-6 w-6 text-hub-cyan" aria-hidden />
      </div>
      <h3 className="font-[family-name:var(--font-outfit)] text-base font-semibold text-hub-text">
        {title}
      </h3>
      <p className="mt-2 max-w-sm text-sm text-hub-text-muted">{description}</p>
      {action && actionLabel ? (
        <Button
          className="mt-6"
          variant="ghost"
          size="sm"
          {...actionButtonProps}
        >
          {actionLabel}
        </Button>
      ) : null}
      {children}
    </div>
  );
}
