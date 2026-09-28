import { clearSessionCookie } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/login";
import { json } from "@/lib/server/n8n";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Forbidden" }, 403);
  await clearSessionCookie();
  return json({ ok: true });
}
