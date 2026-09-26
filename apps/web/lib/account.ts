import { MOCK } from "./api";
import * as mock from "./mock";

export type Account = {
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
export type Profile = Partial<Pick<Account, "name" | "pickupCity" | "pickupAddress" | "pickupHours" | "onboarded">>;
export type PairCode = { code: string; expiresAt: string };

export const PICKUP_HOURS = ["Weekday evenings", "Weekend daytime", "Anytime 10–21"];

export const CONSENT = [
  "poof uses your Marktplaats account to post your ads, read and answer buyer messages, change prices and remove ads once sold.",
  "It never asks for or sees your password: you log in to Marktplaats yourself.",
  "Automated selling may break Marktplaats's terms, and your account could be restricted.",
  "Disconnect any time in poof Settings or in the poof Connector.",
];

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export async function getAccount(): Promise<Account | null> {
  if (MOCK) return mock.getAccount();
  return (await call<{ account: Account | null }>("/api/account")).account;
}

export async function createAccount(profile: Profile = {}): Promise<Account> {
  if (MOCK) return mock.createAccount(profile);
  return (await call<{ account: Account }>("/api/account", { method: "POST", body: JSON.stringify(profile) })).account;
}

export async function updateAccount(profile: Profile): Promise<Account> {
  if (MOCK) return mock.updateAccount(profile);
  return (await call<{ account: Account }>("/api/account", { method: "PATCH", body: JSON.stringify(profile) })).account;
}

export async function newPairCode(): Promise<PairCode> {
  if (MOCK) return mock.newPairCode();
  return call<PairCode>("/api/connect/code", { method: "POST" });
}

export type PhoneLogin = { runId: string; key: string };
export type PhoneLoginStatus = { state: "starting" | "ready" | "ended"; url?: string; message?: string };

/** Start a Marktplaats login in a secure browser poof runs (streamed into the app). */
export async function startPhoneLogin(): Promise<PhoneLogin> {
  if (MOCK) throw new Error("Not available in demo mode");
  return call<PhoneLogin>("/api/connect/phone", { method: "POST" });
}

export async function phoneLoginStatus(l: PhoneLogin): Promise<PhoneLoginStatus> {
  return call<PhoneLoginStatus>(`/api/connect/phone?runId=${encodeURIComponent(l.runId)}&key=${encodeURIComponent(l.key)}`);
}

export async function disconnectMarktplaats(): Promise<void> {
  if (MOCK) return mock.disconnectMarktplaats();
  await call("/api/connect", { method: "DELETE" });
}
