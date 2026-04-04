import type { ReactNode } from "react";
import { HubShell } from "@/components/layout/HubShell";

export default function HubLayout({ children }: { children: ReactNode }) {
  return <HubShell>{children}</HubShell>;
}
