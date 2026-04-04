import { createClient } from "@/lib/supabase/client";

/**
 * Ends the Supabase session then navigates with a full document load.
 * Avoids `router.refresh()` + `router.push()` racing Turbopack on Windows
 * (ENOENT on `.next/.../_buildManifest.js.tmp.*`), especially from Radix dropdowns.
 */
export async function clientSignOut(redirectTo = "/login") {
  const supabase = createClient();
  await supabase.auth.signOut();
  window.location.assign(redirectTo);
}
