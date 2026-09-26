// Server-side calls to the n8n webhooks. Every call carries X-Poof-Key (shared
// secret) and, when known, X-Poof-User.

export type N8nResult<T = unknown> = { status: number; ok: boolean; data: T | null; error?: string };

export function n8nBase() {
  return process.env.N8N_WEBHOOK_BASE?.replace(/\/+$/, "") || null;
}

export function n8nHeaders(userId?: string | null, json = false): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (process.env.POOF_APP_KEY) h["X-Poof-Key"] = process.env.POOF_APP_KEY;
  if (userId) h["X-Poof-User"] = userId;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

/** n8n "respond with all items" returns arrays; unwrap single results. */
function unwrap(v: unknown) {
  return Array.isArray(v) && v.length === 1 ? v[0] : v;
}

export async function n8n<T = unknown>(
  path: string,
  { method = "GET", body, userId }: { method?: "GET" | "POST"; body?: unknown; userId?: string | null } = {},
): Promise<N8nResult<T>> {
  const base = n8nBase();
  if (!base) return { status: 503, ok: false, data: null, error: "N8N_WEBHOOK_BASE is not set on the server." };
  let res: Response;
  try {
    res = await fetch(`${base}/tba/${path.replace(/^\/+/, "")}`, {
      method,
      headers: n8nHeaders(userId, body !== undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch (e) {
    return { status: 502, ok: false, data: null, error: `Could not reach n8n: ${(e as Error).message}` };
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? unwrap(JSON.parse(text)) : null; } catch { data = null; }
  const error = !res.ok ? ((data as { error?: string; message?: string } | null)?.error ?? (data as { message?: string } | null)?.message ?? `n8n responded ${res.status}`) : undefined;
  return { status: res.status, ok: res.ok, data: data as T, error };
}

export const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
