// Log in with Google: off to Supabase (→ Google's account picker), back at ./callback.
import { cookies } from "next/headers";
import { PKCE_COOKIE, googleAuthorizeUrl, pkce } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const { verifier, challenge } = pkce();
  const url = googleAuthorizeUrl(`${origin}/api/auth/google/callback`, challenge);
  if (!url) return Response.redirect(`${origin}/login?error=setup`, 303);
  (await cookies()).set(PKCE_COOKIE, verifier, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/auth/google", maxAge: 600,
  });
  return Response.redirect(url, 303);
}
