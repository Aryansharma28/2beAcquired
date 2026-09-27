// Production end-to-end test of phone push: onboard a test account in the live app, turn on "Phone notifications"
// in Profile (real Chrome, notifications allowed), then fire an n8n event through the real W7 "poof · Push" for a
// temporary item of that account and check the notification shows. Deletes the account, item and helper workflow.
//   node scripts/mp-login/push-e2e.mjs            (uses the system Chrome; cloakbrowser's incognito has no Push API)
import { chromium } from "playwright-core";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { loadEnv, TABLES, Workflow, webhook, respond, code, callWorkflow } = await import(new URL("../../n8n/lib.mjs", import.meta.url).href);
const env = loadEnv();
const APP = "https://poof-lovat.vercel.app";
const H = { "X-N8N-API-KEY": env.N8N_API_KEY, "Content-Type": "application/json" };
const api = async (m, p, b) => { const r = await fetch(env.N8N_BASE_URL + "/api/v1" + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(`${m} ${p} ${r.status} ${t.slice(0, 200)}`); return t ? JSON.parse(t) : {}; };
const rows = async (t, f) => (await api("GET", `/data-tables/${TABLES[t]}/rows?limit=250${f ? "&filter=" + encodeURIComponent(JSON.stringify(f)) : ""}`)).data;
const eq = (c, v) => ({ type: "and", filters: [{ columnName: c, condition: "eq", value: v }] });
const del = (t, c, v) => fetch(`${env.N8N_BASE_URL}/api/v1/data-tables/${TABLES[t]}/rows/delete?filter=${encodeURIComponent(JSON.stringify(eq(c, v)))}`, { method: "DELETE", headers: H });
const log = (s) => console.log(new Date().toISOString().slice(11, 19), s);
const ids = JSON.parse(readFileSync(new URL("../../n8n/ids.json", import.meta.url), "utf8"));
const PUSH_WF = ids.push || (await api("GET", "/workflows?limit=100")).data.find((w) => w.name === "poof · 7 Push").id;

const NAME = "PushTest" + Date.now().toString(36);
let userId = null, wfId = null;
const itemId = "itm_pushtest" + Date.now().toString(36);
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "poof-push-e2e-")), { channel: "chrome", headless: true, viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
await ctx.grantPermissions(["notifications"], { origin: APP });
const page = ctx.pages()[0] ?? (await ctx.newPage());
const btn = (n) => page.getByRole("button", { name: n }).first();
try {
  // 1. onboard + turn on notifications in Profile
  await page.goto(APP + "/welcome", { waitUntil: "networkidle" });
  await btn(/get started/i).click({ timeout: 10000 });
  log("step: profile form " + page.url());
  const inputs = page.locator("input:visible");
  await inputs.nth(0).fill(NAME); await inputs.nth(1).fill("Almere"); await inputs.nth(2).fill("1318 DJ Almere");
  await btn(/^next$/i).click({ timeout: 10000 });
  // Account creation takes a few seconds ("Saving…"): wait for the connect step or for home.
  await page.waitForFunction(() => !/saving/i.test(document.body.innerText) && (/skip for now|continue/i.test(document.body.innerText) || location.pathname !== "/welcome"), null, { timeout: 45000 });
  log("step: after profile " + page.url() + " | " + (await page.getByRole("button").allInnerTexts()).map((t) => t.trim()).join(" | "));
  const skip = btn(/skip for now|continue/i); if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.waitForURL((u) => new URL(u).pathname !== "/welcome", { timeout: 20000 }).catch(() => undefined);
  await page.goto(APP + "/", { waitUntil: "networkidle" });
  log("step: home " + page.url() + " | " + (await page.getByRole("button").allInnerTexts()).map((t) => t.trim()).join(" | ") + " | links: " + (await page.getByRole("link").allInnerTexts()).map((t) => t.trim()).join(" | "));
  await page.getByRole("button", { name: "Profile" }).first().click();
  await page.locator(".psheet .pswitch").waitFor({ timeout: 15000 });
  await page.locator(".psheet .pswitch").click();
  await page.waitForFunction(() => document.querySelector(".psheet .pswitch")?.checked, null, { timeout: 60000 });
  log("switch on in the live app");

  // 2. the phone is saved on the user in n8n
  for (let i = 0; i < 10 && !userId; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const u = (await rows("users")).find((r) => JSON.parse(r.data || "{}").name === NAME);
    if (u && (JSON.parse(u.data).push || []).length) userId = u.userId;
  }
  if (!userId) throw new Error("subscription not saved on the user");
  log(`subscription saved on ${userId}`);

  // 3. a temporary item of that user + an event through the real W7
  await api("POST", `/data-tables/${TABLES.items}/rows`, { data: [{ itemId, status: "live", data: JSON.stringify({ id: itemId, ownerId: userId, title: "Push test item", status: "live" }) }] });
  const w = new Workflow("poof · PUSH E2E TEST (temporary)");
  w.add("In", webhook("tba/push-e2e"));
  w.add("Event", code(`return [{ json: { itemId: ${JSON.stringify(itemId)}, type: 'notify', text: 'Live on Marktplaats at €50' } }];`));
  w.add("Push", callWorkflow(PUSH_WF, { wait: true }));
  w.add("Out", respond("={{ { ok: true } }}"));
  w.chain("In", "Event", "Push", "Out");
  const j = w.toJSON();
  wfId = (await api("POST", "/workflows", { name: j.name, nodes: [], connections: {}, settings: { executionOrder: "v1" } })).id;
  await api("PUT", `/workflows/${wfId}`, j); await api("POST", `/workflows/${wfId}/activate`);
  await new Promise((r) => setTimeout(r, 2500));
  const t0 = Date.now();
  const fire = await fetch(`${env.N8N_BASE_URL}/webhook/tba/push-e2e`, { method: "POST", headers: { "X-Poof-Key": env.POOF_APP_KEY, "Content-Type": "application/json" }, body: "{}" });
  log(`n8n event fired: ${fire.status} ${await fire.text()}`);

  // 4. the notification shows in the browser
  let shown = [];
  for (let i = 0; i < 30 && !shown.length; i++) {
    await page.waitForTimeout(1000);
    shown = await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => ({ title: n.title, body: n.body, url: n.data?.url })));
  }
  log(shown.length ? `NOTIFICATION after ${((Date.now() - t0) / 1000).toFixed(1)}s: ${JSON.stringify(shown)}` : "NO notification within 30 s");
} catch (e) {
  log("FAILED " + e.message.split("\n").slice(0, 14).join(" // "));
  log("at " + page.url() + " | buttons: " + (await page.getByRole("button").allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean).join(" | "));
  await page.screenshot({ path: join(tmpdir(), "push-e2e-failed.png") }).catch(() => {});
} finally {
  if (wfId) { await api("POST", `/workflows/${wfId}/deactivate`).catch(() => {}); await new Promise((r) => setTimeout(r, 3000)); await api("DELETE", `/workflows/${wfId}`).catch((e) => log("wf delete: " + e.message)); }
  await del("items", "itemId", itemId); await del("events", "itemId", itemId);
  const u = (await rows("users")).find((r) => JSON.parse(r.data || "{}").name === NAME);
  if (u) await del("users", "userId", u.userId);
  log("cleaned up (test account, item, helper workflow)");
  await ctx.close();
}
