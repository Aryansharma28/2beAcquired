import { clearSessionCookie } from "@/lib/server/auth";
import { json } from "@/lib/server/n8n";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearSessionCookie();
  return json({ ok: true });
}
