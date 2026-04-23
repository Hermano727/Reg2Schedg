import type { ReactNode } from "react";
import { GlobalSidebar } from "@/components/layout/GlobalSidebar";

export default function CommunityLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1">
      <GlobalSidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
