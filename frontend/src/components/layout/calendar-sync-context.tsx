"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ClassDossier, ScheduleCommitment } from "@/types/dossier";

export type CalendarSyncRequest = {
  classes: ClassDossier[];
  commitments: ScheduleCommitment[];
  courseLabels?: Record<string, string>;
  scheduleTitle?: string;
  includeExamTimes?: boolean;
};

type CalendarSyncHandler = (request: CalendarSyncRequest) => Promise<void> | void;

const CalendarSyncContext = createContext<CalendarSyncHandler | undefined>(undefined);

export function CalendarSyncProvider({
  onSync,
  children,
}: {
  onSync: CalendarSyncHandler;
  children: ReactNode;
}) {
  return (
    <CalendarSyncContext.Provider value={onSync}>
      {children}
    </CalendarSyncContext.Provider>
  );
}

export function useCalendarSyncHandler(): CalendarSyncHandler {
  return useContext(CalendarSyncContext) ?? (() => {});
}
