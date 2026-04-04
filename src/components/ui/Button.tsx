import { forwardRef, type ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-hub-cyan/15 text-hub-cyan ring-1 ring-hub-cyan/35 hover:bg-hub-cyan/25 focus-visible:ring-2 focus-visible:ring-hub-cyan/50",
  ghost:
    "border border-white/[0.08] text-hub-text-secondary hover:border-white/[0.14] hover:text-hub-text focus-visible:ring-2 focus-visible:ring-hub-cyan/40",
  danger:
    "bg-hub-danger/15 text-hub-danger ring-1 ring-hub-danger/35 hover:bg-hub-danger/25 focus-visible:ring-2 focus-visible:ring-hub-danger/50",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-xs",
  md: "h-10 px-4 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className = "", variant = "primary", size = "md", type = "button", ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition outline-none disabled:pointer-events-none disabled:opacity-40 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...props}
      />
    );
  },
);
