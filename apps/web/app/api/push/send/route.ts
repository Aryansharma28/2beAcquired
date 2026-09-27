import webpush, { type PushSubscription, WebPushError } from "web-push";
import { VAPID_PUBLIC_KEY } from "@/lib/push-key";

// POST /api/push/send (X-Poof-Key), called by n8n:
//   { subscriptions: PushSubscriptionJSON[], title, body, url?, tag? }
// Sends a Web Push to every subscription. Answers { sent, gone }: `gone` lists the endpoints the push service
// answered 404/410 for (expired or unsubscribed), so n8n can delete them.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Body = { subscriptions?: unknown; title?: unknown; body?: unknown; url?: unknown; tag?: unknown };

const isSub = (s: unknown): s is PushSubscription => {
  const v = s as PushSubscription | null;
  return !!v && typeof v.endpoint === "string" && /^https:\/\//.test(v.endpoint)
    && typeof v.keys?.p256dh === "string" && typeof v.keys?.auth === "string";
};

export async function POST(req: Request) {
  const appKey = process.env.POOF_APP_KEY;
  if (!appKey || req.headers.get("x-poof-key") !== appKey) return Response.json({ error: "unauthorized" }, { status: 401 });

  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!priv || !subject) return Response.json({ error: "VAPID_PRIVATE_KEY / VAPID_SUBJECT not configured" }, { status: 500 });

  const b = (await req.json().catch(() => ({}))) as Body;
  const title = typeof b.title === "string" ? b.title.trim() : "";
  const text = typeof b.body === "string" ? b.body : "";
  if (!title || !Array.isArray(b.subscriptions)) return Response.json({ error: "subscriptions and title are required" }, { status: 400 });
  const subs = b.subscriptions.filter(isSub);
  const url = typeof b.url === "string" && b.url.startsWith("/") ? b.url : "/";
  const tag = typeof b.tag === "string" && b.tag ? b.tag : undefined;
  const payload = JSON.stringify({ title, body: text, url, ...(tag ? { tag } : {}) });

  const vapidDetails = { subject, publicKey: VAPID_PUBLIC_KEY, privateKey: priv };
  const gone: string[] = [];
  const errors: { endpoint: string; status?: number; error: string }[] = [];
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(s, payload, { vapidDetails, TTL: 60 * 60 * 24, urgency: "high", timeout: 10_000 });
      sent++;
    } catch (e) {
      const status = e instanceof WebPushError ? e.statusCode : undefined;
      if (status === 404 || status === 410) gone.push(s.endpoint);
      else errors.push({ endpoint: s.endpoint, status, error: (e as Error).message });
    }
  }));
  return Response.json({ sent, gone, ...(errors.length ? { errors } : {}) });
}
