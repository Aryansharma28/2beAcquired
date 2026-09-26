import type { IntakeRequest, Item, ItemSummary } from "./types";
import * as mock from "./mock";

/** Mock mode: in-browser simulated backend. Enabled with NEXT_PUBLIC_MOCK=1. */
export const MOCK = process.env.NEXT_PUBLIC_MOCK === "1";
/** Item page poll interval. The mock polls faster so the agent log animates smoothly on video. */
export const POLL_MS = MOCK ? 800 : 2500;

// Same-origin proxy (app/api/tba/[...path]) forwards to ${N8N_WEBHOOK_BASE}/tba/*.
const BASE = "/api/tba";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new Error(msg);
  }
  // n8n "respond with all items" returns an array; unwrap single results.
  if (Array.isArray(data) && data.length === 1 && !path.startsWith("/items")) data = data[0];
  return data as T;
}

export async function intake(body: IntakeRequest): Promise<{ itemId: string }> {
  if (MOCK) return mock.intake(body);
  const r = await req<{ itemId?: string; id?: string }>("/intake", { method: "POST", body: JSON.stringify(body) });
  const itemId = r?.itemId ?? r?.id;
  if (!itemId) throw new Error("Intake did not return an itemId");
  return { itemId };
}

export async function getItem(id: string): Promise<Item> {
  if (MOCK) return mock.getItem(id);
  const item = await req<Item>(`/item?id=${encodeURIComponent(id)}`);
  return normalize(item);
}

export async function listItems(): Promise<ItemSummary[]> {
  if (MOCK) return mock.listItems();
  const r = await req<{ items?: ItemSummary[] } | ItemSummary[]>("/items");
  const items = Array.isArray(r) ? r : r?.items ?? [];
  return [...items].map((i) => ({ ...i, photo: photoUrl(i.photo) })).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

/** Our photo store is private: route Apify record URLs through /api/photo/<key>. */
const APIFY_RECORD = /^https:\/\/api\.apify\.com\/v2\/key-value-stores\/[^/]+\/records\/([\w.-]+)$/;
export const photoUrl = (url?: string) => {
  const m = url?.match(APIFY_RECORD);
  return m ? `/api/photo/${m[1]}` : url;
};

/** Defensive defaults so a half-filled n8n row never crashes a screen. */
function normalize(item: Item): Item {
  return {
    ...item,
    photos: (item.photos ?? []).map((p) => photoUrl(p) ?? p),
    listings: item.listings ?? [],
    conversations: (item.conversations ?? []).map((c) => ({ ...c, messages: c.messages ?? [] })),
    events: item.events ?? [],
  };
}
