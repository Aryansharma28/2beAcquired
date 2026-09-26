// Same-origin proxy to the n8n webhooks, so the browser never needs CORS.
// /api/tba/<path>?<query>  ->  ${N8N_WEBHOOK_BASE}/tba/<path>?<query>
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED = new Set(["intake", "details", "item", "items", "approve", "sold"]);

async function forward(req: NextRequest, path: string[], method: "GET" | "POST") {
  const base = process.env.N8N_WEBHOOK_BASE?.replace(/\/+$/, "");
  if (!base) {
    return Response.json(
      { error: "N8N_WEBHOOK_BASE is not set on the server. Set it, or run with NEXT_PUBLIC_MOCK=1." },
      { status: 503 },
    );
  }
  const joined = path.join("/");
  if (!ALLOWED.has(path[0] ?? "")) {
    return Response.json({ error: `Unknown endpoint /tba/${joined}` }, { status: 404 });
  }

  const target = `${base}/tba/${joined}${req.nextUrl.search}`;
  const init: RequestInit = { method, headers: { Accept: "application/json" }, cache: "no-store" };
  if (method === "POST") {
    init.body = await req.text();
    init.headers = { ...init.headers, "Content-Type": "application/json" };
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (err) {
    return Response.json({ error: `Could not reach n8n: ${(err as Error).message}` }, { status: 502 });
  }

  const text = await upstream.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { error: "n8n returned a non-JSON response", raw: text.slice(0, 500) };
  }
  return Response.json(body, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/tba/[...path]">) {
  const { path } = await ctx.params;
  return forward(req, path, "GET");
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/tba/[...path]">) {
  const { path } = await ctx.params;
  return forward(req, path, "POST");
}
