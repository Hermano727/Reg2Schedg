"use client";

import { useCallback, type ReactNode } from "react";
import { Header } from "@/components/layout/Header";

type HubShellProps = {
  children: ReactNode;
};

export function HubShell({ children }: HubShellProps) {
  const handleSyncCalendar = useCallback(() => {
    alert("Google Calendar sync will call your FastAPI backend after OAuth.");
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <Header onSyncCalendar={handleSyncCalendar} />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
