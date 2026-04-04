"use client";

import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { clientSignOut } from "@/lib/auth/client-sign-out";
import { Button } from "@/components/ui/Button";
import type { ButtonProps } from "@/components/ui/Button";

type SignOutButtonProps = Omit<ButtonProps, "onClick" | "children" | "type"> & {
  redirectTo?: string;
  children?: ReactNode;
};

export function SignOutButton({
  redirectTo = "/login",
  children,
  variant = "ghost",
  className = "",
  ...props
}: SignOutButtonProps) {
  async function handleSignOut() {
    await clientSignOut(redirectTo);
  }

  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      onClick={() => void handleSignOut()}
      {...props}
    >
      <LogOut className="h-4 w-4 shrink-0" aria-hidden />
      {children ?? "Sign out"}
    </Button>
  );
}
