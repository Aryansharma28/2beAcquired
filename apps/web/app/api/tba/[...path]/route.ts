// Same-origin proxy to the n8n webhooks, so the browser never needs CORS.
// /api/tba/<path>?<query>  ->  ${N8N_WEBHOOK_BASE}/tba/<path>?<query>
// Requires the poof session cookie; forwards X-Poof-Key + X-Poof-User.
import type { NextRequest } from "next/server";
import { currentUserId } from "@/lib/server/auth";
import { json, n8nBase, n8nHeaders } from "@/lib/server/n8n";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED = new Set(["intake", "item", "items", "details", "approve", "me"]);

async function forward(req: NextRequest, path: string[], method: "GET" | "POST") {
  const base = n8nBase();
  if (!base) {
    return json({ error: "N8N_WEBHOOK_BASE is not set on the server. Set it, or run with NEXT_PUBLIC_MOCK=1." }, 503);
  }
  const joined = path.join("/");
  if (!ALLOWED.has(path[0] ?? "") || path.length > 1) {
    return json({ error: `Unknown endpoint /tba/${joined}` }, 404);
  }
  const userId = await currentUserId();
  if (!userId) return json({ error: "No poof account on this device. Open the app to set one up." }, 401);

  const init: RequestInit = { method, headers: n8nHeaders(userId, method === "POST"), cache: "no-store" };
  if (method === "POST") init.body = await req.text();

  let upstream: Response;
  try {
    upstream = await fetch(`${base}/tba/${joined}${req.nextUrl.search}`, init);
  } catch (err) {
    return json({ error: `Could not reach n8n: ${(err as Error).message}` }, 502);
  }

  const text = await upstream.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { error: "n8n returned a non-JSON response", raw: text.slice(0, 500) };
  }
  return json(body, upstream.status);
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/tba/[...path]">) {
  const { path } = await ctx.params;
  return forward(req, path, "GET");
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/tba/[...path]">) {
  const { path } = await ctx.params;
  return forward(req, path, "POST");
}
