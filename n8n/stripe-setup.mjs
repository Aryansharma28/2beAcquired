// One-time: register poof's payment webhook with Stripe (idempotent). Needs STRIPE_SECRET_KEY and N8N_BASE_URL in .env.
//   node n8n/stripe-setup.mjs
import { loadEnv } from "./lib.mjs";

const env = loadEnv();
const key = env.STRIPE_SECRET_KEY;
if (!key) throw new Error("Set STRIPE_SECRET_KEY in .env first");
const url = `${env.N8N_BASE_URL}/webhook/tba/stripe`;
const api = (path, body) =>
  fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${key}`, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body,
  }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || r.status); return j; });

const existing = (await api("webhook_endpoints?limit=100")).data.find((e) => e.url === url);
if (existing) {
  console.log(`Webhook already registered: ${existing.id} → ${url}`);
} else {
  const events = ["checkout.session.completed", "checkout.session.async_payment_succeeded"];
  const body = [`url=${encodeURIComponent(url)}`, ...events.map((e) => `enabled_events[]=${e}`), "description=poof payments"].join("&");
  const created = await api("webhook_endpoints", body);
  console.log(`Registered webhook ${created.id} → ${url} (${events.join(", ")})`);
}
const acct = await api("account");
console.log(`Stripe account ${acct.id} (${key.startsWith("sk_test_") ? "TEST mode" : "LIVE mode"}), country ${acct.country}`);
