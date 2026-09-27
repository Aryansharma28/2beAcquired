// Phone notifications (Web Push, VAPID), browser side.
// Works on Android Chrome / Samsung Internet and on iOS 16.4+ once Poof is added to the home screen.
// Notification.requestPermission() is only ever called from a tap (enablePush), never on load.
import { pushSubscribe } from "./api";
import { VAPID_PUBLIC_KEY } from "./push-key";

/** needs-install: iOS/iPadOS in a browser tab, where Web Push only exists for home-screen apps. */
export type PushState = "loading" | "unsupported" | "needs-install" | "denied" | "off" | "on";

const supported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function isIosBrowserTab() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

function keyBytes(b64url: string) {
  const b64 = (b64url + "=".repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** SwRegister only registers /sw.js in production; register it here when missing (so dev works too). */
async function registration() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return isIosBrowserTab() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  try {
    return (await currentSubscription()) ? "on" : "off";
  } catch {
    return "off";
  }
}

/** Call straight from a tap handler: asks permission, subscribes this device and tells n8n. */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return isIosBrowserTab() ? "needs-install" : "unsupported";
  // First thing in the gesture: iOS drops the permission prompt if we await something else before it.
  const perm = await Notification.requestPermission();
  if (perm === "denied") return "denied";
  if (perm !== "granted") return "off";
  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  try {
    await pushSubscribe(sub.toJSON());
  } catch (e) {
    await sub.unsubscribe().catch(() => false);
    throw e;
  }
  return "on";
}

/** Stops notifications on this device: tells n8n to forget the subscription, then unsubscribes locally. */
export async function disablePush(): Promise<PushState> {
  const sub = await currentSubscription();
  if (sub) {
    // Unsubscribe even if n8n is unreachable: the endpoint then answers 410 and n8n cleans it up on the next send.
    try { await pushSubscribe(sub.toJSON(), true); } finally { await sub.unsubscribe().catch(() => false); }
  }
  return pushState();
}

// "Prompt dismissed" is the only thing kept in localStorage.
const DISMISSED = "poof:push-prompt-dismissed";
export const promptDismissed = () => { try { return localStorage.getItem(DISMISSED) === "1"; } catch { return false; } };
export const dismissPrompt = () => { try { localStorage.setItem(DISMISSED, "1"); } catch { /* private mode */ } };
