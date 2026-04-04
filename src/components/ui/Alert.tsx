import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import type { ReactNode } from "react";

type AlertVariant = "info" | "warn" | "error";

type AlertProps = {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  className?: string;
};

const icons = {
  info: Info,
  warn: AlertTriangle,
  error: AlertCircle,
} as const;

const styles: Record<AlertVariant, string> = {
  info: "border-hub-cyan/30 bg-hub-cyan/10 text-hub-text",
  warn: "border-hub-gold/35 bg-hub-gold/10 text-hub-text",
  error: "border-hub-danger/35 bg-hub-danger/10 text-hub-text",
};

const iconColor: Record<AlertVariant, string> = {
  info: "text-hub-cyan",
  warn: "text-hub-gold",
  error: "text-hub-danger",
};

export function Alert({
  variant = "info",
  title,
  children,
  className = "",
}: AlertProps) {
  const Icon = icons[variant];
  return (
    <div
      role="alert"
      className={`flex gap-3 rounded-lg border px-4 py-3 text-sm ${styles[variant]} ${className}`}
    >
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor[variant]}`}
        aria-hidden
      />
      <div className="min-w-0">
        {title ? (
          <p className="font-semibold text-hub-text">{title}</p>
        ) : null}
        <div className={title ? "mt-1 text-hub-text-secondary" : "text-hub-text-secondary"}>
          {children}
        </div>
      </div>
    </div>
  );
}
