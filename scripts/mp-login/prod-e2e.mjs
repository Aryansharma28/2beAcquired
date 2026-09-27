// Real end-to-end test of the production app (new UI, real backend): onboard → sell (real photo) → wizard → ad review → approve.
//   node scripts/mp-login/prod-e2e.mjs <photo.jpg>
import { launch } from "cloakbrowser";
const photo = process.argv[2];
const APP = "https://poof-lovat.vercel.app";
const b = await launch({ headless: false, args: ["--window-size=470,1000", "--window-position=40,20"], launchOptions: { slowMo: 250 } });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 400 && !r.url().endsWith("/api/account")) errors.push(`${r.status()} ${r.url()}`); });
const log = (s) => console.log(new Date().toISOString().slice(11, 19), s);
const btn = (n) => page.getByRole("button", { name: n }).first();
const text = async () => (await page.locator("body").innerText()).replace(/\s+/g, " ");
const overflow = async () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
try {
  await page.goto(APP + "/welcome", { waitUntil: "networkidle" });
  await btn(/get started/i).click();
  const inputs = page.locator("main input");
  await inputs.nth(0).fill("Aryan"); await inputs.nth(1).fill("Almere"); await inputs.nth(2).fill("1318 DJ Almere");
  const hours = page.getByRole("button", { name: /weekend daytime/i }).first();
  if (await hours.isVisible().catch(() => false)) await hours.click();
  await btn(/^next$/i).click();
  await page.getByRole("button", { name: /continue/i }).first().waitFor({ timeout: 30000 });
  log("connect step: " + (await text()).slice(0, 120));
  await btn(/continue/i).click();
  await page.waitForTimeout(2000);
  log("home: " + page.url() + " overflow=" + (await overflow()));
  await page.goto(APP + "/new", { waitUntil: "networkidle" });
  await page.locator("input[type=file]:not([capture])").setInputFiles(photo);
  await page.waitForTimeout(1500);
  await btn(/^done$/i).click();
  await page.waitForURL(/\/item\//, { timeout: 60000 });
  const itemUrl = page.url(); log("item: " + itemUrl);
  await page.getByText(/is this it/i).first().waitFor({ timeout: 180000 });
  log("recognised: " + (await text()).slice(0, 160));
  await btn(/yes, that/i).click();
  await btn(/^next$/i).click(); // goal
  log("minimum: " + (await text()).match(/What's your minimum.{0,120}/)?.[0]);
  await btn(/^next$/i).click(); // minimum
  const city = await page.locator("main input").first().inputValue();
  log("pickup city default: " + city);
  await btn(/create my ad/i).click();
  await btn(/approve and sell/i).waitFor({ timeout: 180000 });
  log("ad review: " + (await text()).slice(0, 300) + " overflow=" + (await overflow()));
  await btn(/approve and sell/i).click();
  log("approved, waiting for live…");
  const t0 = Date.now();
  while (Date.now() - t0 < 300000) {
    const s = await text();
    if (/marktplaats\.nl\/m\d{8,}|live on|it's online|is online/i.test(s) || /hit a problem|error/i.test(s)) { log("state: " + s.slice(0, 300)); break; }
    await page.waitForTimeout(5000);
  }
  const hrefs = await page.locator("a[href*='marktplaats.nl']").evaluateAll((as) => as.map((a) => a.href));
  log("listing links: " + JSON.stringify(hrefs));
  log("final url: " + page.url());
} catch (e) {
  log("FAILED: " + e.message.split("\n")[0]);
  log("page: " + (await text().catch(() => "")).slice(0, 300));
} finally {
  log("errors: " + JSON.stringify(errors));
  await page.waitForTimeout(3000);
  await b.close();
}
