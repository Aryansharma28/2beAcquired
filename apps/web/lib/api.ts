import type { ApproveRequest, DetailsRequest, IntakeRequest, Item, ItemSummary, Status } from "./types";
import * as mock from "./mock";

/** Mock mode: in-browser simulated backend. Enabled with NEXT_PUBLIC_MOCK=1. */
export const MOCK = process.env.NEXT_PUBLIC_MOCK === "1";
/** Item page poll interval. The mock polls faster so the agent steps animate smoothly on video. */
export const POLL_MS = MOCK ? 800 : 2500;
/** While intake is recognising or pricing, the answer lands within seconds: poll faster so it shows right away. */
export const POLL_FAST_MS = 700;

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
  if (res.status === 401 && typeof window !== "undefined" && location.pathname !== "/welcome") {
    // Outside React (plain fetch helper): the session is gone, restart onboarding.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    location.href = "/welcome";
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new Error(msg);
  }
  // n8n "respond with all items" returns an array; unwrap single results.
  if (Array.isArray(data) && data.length === 1 && !path.startsWith("/items")) data = data[0];
  return data as T;
}

const post = <T,>(path: string, body: unknown) => req<T>(path, { method: "POST", body: JSON.stringify(body) });

export async function intake(body: IntakeRequest): Promise<{ itemId: string }> {
  if (MOCK) return mock.intake(body);
  const r = await post<{ itemId?: string; id?: string }>("/intake", body);
  const itemId = r?.itemId ?? r?.id;
  if (!itemId) throw new Error("Intake did not return an itemId");
  return { itemId };
}

/** Screens 02–05: the owner's answers. Starts pricing + ad writing. */
export async function details(body: DetailsRequest): Promise<void> {
  if (MOCK) return mock.details(body);
  await post("/details", body);
}

/** Screen 02 "Fix it": recognition was wrong. Re-runs the market check for the corrected name (~20–40 s). */
export type RenameResult = { priceRange?: Item["priceRange"] | null; compsCount?: number; comps?: Item["comps"] };
export async function rename(itemId: string, name: string): Promise<RenameResult> {
  if (MOCK) return { priceRange: null, compsCount: 0, comps: [] };
  return post<RenameResult>("/rename", { itemId, name });
}

/** Screen 07: approve the ad (only edited fields are sent). Starts publishing. */
export async function approve(body: ApproveRequest): Promise<void> {
  if (MOCK) return mock.approve(body);
  await post("/approve", body);
}

/** "Mark as picked up & paid" (cash at pickup): a deal/pickup becomes sold. Idempotent. */
export async function markDone(itemId: string): Promise<void> {
  if (MOCK) return mock.done(itemId);
  await post("/done", { itemId });
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
  return items
    .filter((i) => i && i.id)
    .map((i) => ({
      ...i,
      status: normStatus(i.status),
      photo: photoUrl(i.photo ?? i.photos?.[i.coverIndex ?? 0] ?? i.photos?.[0]),
      cutout: photoUrl(i.cutout),
      conversations: Array.isArray(i.conversations) ? i.conversations.map((c) => ({ ...c, messages: c.messages ?? [] })) : undefined,
    }))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

/** Our photo store is private: route Apify record URLs through /api/photo/<key>. */
const APIFY_RECORD = /^https:\/\/api\.apify\.com\/v2\/key-value-stores\/[^/]+\/records\/([\w.-]+)$/;
export const photoUrl = (url?: string) => {
  const m = url?.match(APIFY_RECORD);
  return m ? `/api/photo/${m[1]}` : url;
};

const KNOWN: Status[] = [
  "recognizing", "needs_details", "writing", "ad_ready", "needs_connection", "publishing", "live", "negotiating",
  "deal", "pickup_scheduled", "sold", "error", "analyzing", "delisted", "needs_you",
];
function normStatus(s: unknown): Status {
  if (s === "analyzing") return "recognizing";
  if (s === "delisted") return "sold";
  if (s === "needs_you") return "negotiating";
  return KNOWN.includes(s as Status) ? (s as Status) : "recognizing";
}

const num = (v: unknown) => (v == null || v === "" || Number.isNaN(Number(v)) ? undefined : Number(v));
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Defensive defaults so a half-filled n8n row never crashes a screen. */
function normalize(item: Item): Item {
  const pr = item.priceRange;
  return {
    ...item,
    status: normStatus(item.status),
    createdAt: item.createdAt ?? new Date().toISOString(),
    photos: arr<string>(item.photos).map((p) => photoUrl(p) ?? p),
    cutout: photoUrl(item.cutout),
    floorPrice: num(item.floorPrice),
    askPrice: num(item.askPrice),
    priceRange: pr && num(pr.low) != null && num(pr.high) != null
      ? { low: Number(pr.low), mid: num(pr.mid) ?? (Number(pr.low) + Number(pr.high)) / 2, high: Number(pr.high) }
      : undefined,
    pricePlan: arr<{ price: number; from: string }>(item.pricePlan).filter((p) => num(p?.price) != null),
    comps: arr(item.comps),
    listings: arr(item.listings),
    conversations: arr<Item["conversations"][number]>(item.conversations).map((c) => ({ ...c, messages: arr(c.messages) })),
    events: arr(item.events),
  };
}
