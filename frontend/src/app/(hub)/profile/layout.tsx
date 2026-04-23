import type { ReactNode } from "react";

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1">
      {children}
    </div>
  );
}
