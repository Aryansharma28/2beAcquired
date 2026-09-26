// Phone login: start the actor's `login` action (CloakBrowser on Apify with a live view) for this
// user, and report when its viewer is ready. The actor claims the session itself through
// /api/connect/claim with a fresh pairing code, exactly like the poof Connector.
import { randomBytes } from "node:crypto";
import { currentUserId } from "@/lib/server/auth";
import { json, n8n } from "@/lib/server/n8n";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const API = "https://api.apify.com/v2";
const ACTOR = process.env.APIFY_ACTOR_ID || "jadelike_loyalty~marktplaats";

function token() {
  const t = process.env.APIFY_TOKEN;
  if (!t) throw new Error("APIFY_TOKEN is not set on the server.");
  return t;
}

async function apify<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!res.ok || !body?.data) throw new Error(body?.error?.message ?? `Apify ${res.status}`);
  return body.data;
}

type Run = { id: string; status: string; statusMessage?: string; containerUrl?: string; defaultKeyValueStoreId: string };

/** POST: start a login run. Returns { runId, key }; the key is the viewer secret, needed to poll. */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return json({ error: "No account" }, 401);
  const pair = await n8n<{ code?: string | number }>("pair/new", { method: "POST", userId, body: { userId } });
  const code = pair.data?.code != null ? String(pair.data.code).padStart(6, "0") : null;
  if (!pair.ok || !code) return json({ error: pair.error ?? "No pairing code" }, 502);

  const viewToken = randomBytes(24).toString("hex");
  const poofUrl = process.env.POOF_PUBLIC_URL || new URL(req.url).origin;
  try {
    const run = await apify<Run>(`/acts/${ACTOR}/runs?timeout=1200&memory=2048`, {
      method: "POST",
      body: JSON.stringify({ action: "login", pairCode: code, poofUrl, viewToken, useProxy: true, timeoutMinutes: 15 }),
    });
    return json({ runId: run.id, key: viewToken });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
}

/** GET ?runId=&key= → { state: starting | ready | ended, url? } */
export async function GET(req: Request) {
  const userId = await currentUserId();
  if (!userId) return json({ error: "No account" }, 401);
  const q = new URL(req.url).searchParams;
  const runId = q.get("runId") ?? "";
  const key = q.get("key") ?? "";
  if (!/^[A-Za-z0-9]{10,30}$/.test(runId) || key.length < 16) return json({ error: "Bad request" }, 400);
  try {
    const run = await apify<Run>(`/actor-runs/${runId}`);
    if (!["READY", "RUNNING"].includes(run.status)) return json({ state: "ended", status: run.status, message: run.statusMessage ?? "" });
    if (!run.statusMessage?.startsWith("login: ready") || !run.containerUrl) return json({ state: "starting" });
    return json({ state: "ready", url: `${run.containerUrl.replace(/\/+$/, "")}/?t=${encodeURIComponent(key)}` });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
}

/** DELETE ?runId=&key= → stop the login run (the user closed the window). The key must match the run's viewToken. */
export async function DELETE(req: Request) {
  const userId = await currentUserId();
  if (!userId) return json({ error: "No account" }, 401);
  const q = new URL(req.url).searchParams;
  const runId = q.get("runId") ?? "";
  const key = q.get("key") ?? "";
  if (!/^[A-Za-z0-9]{10,30}$/.test(runId) || key.length < 16) return json({ error: "Bad request" }, 400);
  try {
    const run = await apify<Run>(`/actor-runs/${runId}`);
    const res = await fetch(`${API}/key-value-stores/${run.defaultKeyValueStoreId}/records/INPUT`, {
      headers: { Authorization: `Bearer ${token()}` },
      cache: "no-store",
    });
    const input = (await res.json().catch(() => null)) as { action?: string; viewToken?: string } | null;
    if (input?.action !== "login" || input.viewToken !== key) return json({ error: "Not your login" }, 403);
    if (["READY", "RUNNING"].includes(run.status)) await apify<Run>(`/actor-runs/${runId}/abort`, { method: "POST" });
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
}
