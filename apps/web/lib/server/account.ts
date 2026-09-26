import { n8n } from "./n8n";

export type AccountOut = {
  userId: string;
  name?: string;
  pickupCity?: string;
  pickupAddress?: string;
  pickupHours?: string[];
  onboarded?: boolean;
  mpConnected: boolean;
  mpName?: string;
  connectedAt?: string;
};

/** n8n /tba/me may return the row ({userId, status, data:{...}}) or a flat object. */
export function normalizeAccount(userId: string, raw: unknown): AccountOut {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  let data = r.data;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { data = {}; }
  }
  const d = { ...r, ...((data && typeof data === "object" ? data : {}) as Record<string, unknown>) };
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
  return {
    userId,
    name: str(d.name),
    pickupCity: str(d.pickupCity),
    pickupAddress: str(d.pickupAddress),
    pickupHours: Array.isArray(d.pickupHours) ? d.pickupHours.filter((x): x is string => typeof x === "string") : undefined,
    onboarded: d.onboarded === true || d.onboarded === "true",
    mpConnected: d.mpConnected === true || d.mpConnected === "true",
    mpName: str(d.mpName),
    connectedAt: str(d.connectedAt),
  };
}

export async function fetchAccount(userId: string) {
  const r = await n8n("me", { userId });
  return { ...r, account: r.ok && r.data ? normalizeAccount(userId, r.data) : null };
}

const PROFILE_KEYS = ["name", "pickupCity", "pickupAddress", "pickupHours", "onboarded"] as const;

/** Only the profile fields the app may set. */
export function profileFrom(body: unknown) {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of PROFILE_KEYS) {
    const v = b[k];
    if (v === undefined) continue;
    if (k === "pickupHours") out[k] = Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 6) : [];
    else if (k === "onboarded") out[k] = v === true;
    else if (typeof v === "string") out[k] = v.trim().slice(0, 200);
  }
  return out;
}
