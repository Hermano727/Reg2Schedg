import { Suspense } from "react";
import { CommandCenter } from "@/components/command-center/CommandCenter";

export default function HomePage() {
  return (
    <Suspense>
      <CommandCenter />
    </Suspense>
  );
}
