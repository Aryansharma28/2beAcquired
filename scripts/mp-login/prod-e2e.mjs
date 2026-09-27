// Real end-to-end test of the production app (real backend, real Marktplaats): onboard → sell (real photos) →
// "Is this it?" (early, before prices) → Fix it → minimum + goal → create ad → approve → live on Marktplaats.
// Screenshots of every screen go to --shots (default ./e2e-shots). Prints the itemId and listing for cleanup.
//   node scripts/mp-login/prod-e2e.mjs [--rename "Nijntje notitieboek"] [--no-approve] [--shots dir] <photo.jpg> [more photos]
import { launch } from "cloakbrowser";
import { mkdirSync } from "node:fs";

const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; };
const flag = (k) => { const i = argv.indexOf(k); return i >= 0 ? (argv.splice(i, 1), true) : false; };
const rename = opt("--rename");
const shots = opt("--shots") || "e2e-shots";
const noApprove = flag("--no-approve");
const photos = argv;
mkdirSync(shots, { recursive: true });

const APP = "https://poof-lovat.vercel.app";
const b = await launch({ headless: false, args: ["--window-size=470,1000", "--window-position=40,20"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 400 && !r.url().endsWith("/api/account")) errors.push(`${r.status()} ${r.url()}`); });
const T0 = Date.now();
const log = (s) => console.log(`${((Date.now() - T0) / 1000).toFixed(1).padStart(6)}s  ${s}`);
const btn = (n) => page.getByRole("button", { name: n }).first();
const text = async () => (await page.locator("body").innerText()).replace(/\s+/g, " ");
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
let n = 0;
const shot = async (name) => { await page.screenshot({ path: `${shots}/${String(++n).padStart(2, "0")}-${name}.png`, fullPage: true }); };
const buttons = async () => (await page.getByRole("button").allInnerTexts()).map((s) => s.trim()).filter(Boolean).join(" | ");

try {
  await page.goto(APP + "/welcome", { waitUntil: "networkidle" });
  await shot("welcome");
  await btn(/get started/i).click();
  await page.waitForTimeout(500);
  await shot("profile");
  const inputs = page.locator("input:visible");
  log(`profile: ${await inputs.count()} inputs; buttons: ${await buttons()}`);
  await inputs.nth(0).fill("Aryan");
  if (await inputs.count() > 1) await inputs.nth(1).fill("Almere");
  if (await inputs.count() > 2) await inputs.nth(2).fill("1318 DJ Almere");
  const hours = page.getByRole("button", { name: /weekend daytime/i }).first();
  if (await hours.isVisible().catch(() => false)) await hours.click();
  await btn(/^(next|continue|done|start)/i).click();
  await page.waitForTimeout(3000);
  await shot("after-profile");
  log(`after profile: ${page.url()} | ${await buttons()}`);
  for (let i = 0; i < 3 && !/\/$|\/new|\/item/.test(new URL(page.url()).pathname) ; i++) {
    const c = btn(/^(continue|next|skip|done|start selling|go)/i);
    if (!(await c.isVisible().catch(() => false))) break;
    await c.click(); await page.waitForTimeout(2000);
  }
  log(`home: ${page.url()} overflow=${await overflow()}`);
  await shot("home");

  await page.goto(APP + "/new", { waitUntil: "networkidle" });
  await page.locator("input[type=file]:not([capture])").setInputFiles(photos);
  await page.waitForTimeout(1500);
  await shot("photos-picked");
  const tUpload = Date.now();
  await btn(/^done$/i).click();
  await page.waitForURL(/\/item\//, { timeout: 60000 });
  const itemId = page.url().split("/item/")[1];
  log(`ITEM ${itemId}`);
  await page.getByText(/is this it/i).first().waitFor({ timeout: 180000 });
  log(`"Is this it?" shown ${((Date.now() - tUpload) / 1000).toFixed(1)}s after Done`);
  await shot("is-this-it");
  log("is-this-it: " + (await text()).slice(0, 260));

  if (rename) {
    await btn(/^fix it$/i).click();
    await page.waitForTimeout(400);
    const nameInput = page.locator("input:visible").first();
    await nameInput.fill(rename);
    await shot("fix-it");
    const tr = Date.now();
    await btn(/use this name/i).click();
    await page.getByText(/what's your minimum/i).first().waitFor({ timeout: 60000 });
    log(`renamed to "${rename}" and re-priced in ${((Date.now() - tr) / 1000).toFixed(1)}s`);
  } else {
    await btn(/yes, that/i).click();
    await page.getByText(/what's your minimum/i).first().waitFor({ timeout: 30000 });
  }
  // The market picture may still be coming in: wait for the histogram line (or give up after 20 s).
  const tm = Date.now();
  while (Date.now() - tm < 20000 && /checking what similar/i.test(await text())) await page.waitForTimeout(500);
  await page.waitForTimeout(800);
  await shot("minimum");
  log("minimum: " + ((await text()).match(/What's your minimum.{0,260}/)?.[0] ?? (await text()).slice(0, 260)));
  await btn(/^next$/i).click();
  await page.waitForTimeout(800);
  await shot("handover");
  log("handover: " + (await text()).slice(0, 200) + " | " + (await buttons()));
  const tc = Date.now();
  await btn(/create my ad/i).click();
  await btn(/approve and sell/i).waitFor({ timeout: 240000 });
  log(`ad written in ${((Date.now() - tc) / 1000).toFixed(1)}s`);
  await page.waitForTimeout(800);
  await shot("ad-review");
  log("ad review: " + (await text()).slice(0, 700) + " overflow=" + (await overflow()));

  if (!noApprove) {
    const ta = Date.now();
    await btn(/approve and sell/i).click();
    log("approved, waiting for live…");
    let lastShot = 0;
    while (Date.now() - ta < 360000) {
      const s = await text();
      if (Date.now() - lastShot > 20000) { await shot("going-live"); lastShot = Date.now(); }
      const links = await page.locator("a[href*='marktplaats.nl/v/'], a[href*='marktplaats.nl/m']").evaluateAll((as) => as.map((a) => a.href)).catch(() => []);
      if (links.length || /hit a problem|went wrong|failed/i.test(s)) { log("state: " + s.slice(0, 300)); break; }
      await page.waitForTimeout(4000);
    }
    log(`after approve ${((Date.now() - ta) / 1000).toFixed(1)}s`);
    await page.waitForTimeout(4000);
    await shot("live");
    const hrefs = await page.locator("a[href*='marktplaats.nl']").evaluateAll((as) => as.map((a) => a.href));
    log("LISTINGS " + JSON.stringify(hrefs));
    log("live page: " + (await text()).slice(0, 400));
  }
} catch (e) {
  log("FAILED: " + e.message.split("\n")[0]);
  log("page: " + (await text().catch(() => "")).slice(0, 400));
  log("buttons: " + (await buttons().catch(() => "")));
  await shot("failed").catch(() => {});
} finally {
  log("errors: " + JSON.stringify(errors));
  await page.waitForTimeout(2000);
  await b.close();
}
