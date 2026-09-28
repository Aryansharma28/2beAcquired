// Google (via Supabase) sends the user back here with ?code=… Swap it for the user, sign in, and hand over to
// /login?done=… which plays the poof and moves on.
import { cookies } from "next/headers";
import { completeLogin } from "@/lib/server/login";
import { PKCE_COOKIE, endSupabaseSession, exchangeGoogleCode } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => Response.redirect(`${url.origin}/login?${q}`, 303);
  const jar = await cookies();
  const verifier = jar.get(PKCE_COOKIE)?.value;
  jar.delete({ name: PKCE_COOKIE, path: "/api/auth/google" });

  const code = url.searchParams.get("code");
  if (!code) return back(url.searchParams.get("error") === "access_denied" ? "error=cancelled" : "error=google");
  if (!verifier) return back("error=expired");

  const got = await exchangeGoogleCode(code, verifier);
  if (!got.ok) return back("error=google");
  const done = await completeLogin(got.data.user);
  await endSupabaseSession(got.data.accessToken);
  return done.ok ? back(`done=${done.onboarded ? "home" : "welcome"}`) : back("error=account");
}
