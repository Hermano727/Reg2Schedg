import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUcsdEmail } from "@/lib/auth/ucsd";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!isUcsdEmail(user?.email)) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=ucsd_only`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
