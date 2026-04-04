import type { ReactNode } from "react";

type CardProps = {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function Card({ title, description, children, className = "" }: CardProps) {
  return (
    <section
      className={`glass-panel rounded-xl p-5 ${className}`}
    >
      {title ? (
        <header className="mb-4">
          <h2 className="font-[family-name:var(--font-outfit)] text-base font-semibold tracking-tight text-hub-text">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm text-hub-text-muted">{description}</p>
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
