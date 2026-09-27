// Screenshots of item cutouts in mock mode (`NEXT_PUBLIC_MOCK=1 next dev`): sell two items with real photos, wait for
// the cutouts, then capture the home grid (stickers + price tags), a context sticker and the chats header.
//   node scripts/mp-login/cutout-shots.mjs <appUrl> <outDir> <photoA.jpg> <photoB.jpg>
import { launch } from "cloakbrowser";
import { mkdirSync } from "node:fs";

const [APP, out, ...photos] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const b = await launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const log = (s) => console.log(new Date().toISOString().slice(11, 19), s);
const btn = (n) => page.getByRole("button", { name: n }).first();
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
// In-app navigation (a full reload would drop the mock's in-memory cutouts).
const nav = async (path) => {
  const link = page.locator(`a[href="${path}"]`).first();
  if (await link.count()) { await link.click(); await page.waitForURL((u) => new URL(u).pathname === path, { timeout: 15000 }).catch(() => undefined); }
  else await page.evaluate((p) => { window.history.pushState({}, "", p); window.dispatchEvent(new PopStateEvent("popstate")); }, path);
  await page.waitForTimeout(1200);
};

try {
  await page.goto(APP + "/welcome", { waitUntil: "networkidle" });
  await btn(/get started/i).click();
  const inputs = page.locator("input:visible");
  await inputs.nth(0).fill("Aryan"); await inputs.nth(1).fill("Almere"); await inputs.nth(2).fill("1318 DJ Almere");
  await btn(/^next$/i).click();
  await page.waitForTimeout(1500);
  const skip = btn(/skip for now|continue/i);
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.waitForTimeout(1500);

  for (const photo of photos) {
    await page.goto(APP + "/new", { waitUntil: "networkidle" });
    await page.locator("input[type=file]:not([capture])").setInputFiles(photo);
    await page.waitForTimeout(800);
    await btn(/^done$/i).click();
    await page.waitForURL(/\/item\//, { timeout: 60000 });
    await page.getByText(/is this it/i).first().waitFor({ timeout: 60000 });
    log("is this it: " + page.url());
    await btn(/yes, that/i).click();
    await page.getByText(/what's your minimum/i).first().waitFor({ timeout: 30000 });
    // the cutout arrives ~10-15 s after recognition; the context sticker swaps to it
    const t0 = Date.now();
    while (Date.now() - t0 < 45000 && !(await page.locator(".context img[src^='data:image/png']").count())) await page.waitForTimeout(1000);
    log(`context cutout after ${((Date.now() - t0) / 1000).toFixed(1)}s: ${await page.locator(".context img[src^='data:image/png']").count() ? "yes" : "no"}`);
    await page.waitForTimeout(600);
    await shot(`cutout-context-${photos.indexOf(photo) + 1}`);
    await btn(/^next$/i).click();
    await page.waitForTimeout(500);
    await btn(/create my ad/i).click();
    await btn(/approve and sell/i).waitFor({ timeout: 60000 });
    await btn(/approve and sell/i).click();
    await page.waitForTimeout(9000);
  }
  await page.goto(APP + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await shot("cutout-home");
  log("home stickers: " + JSON.stringify(await page.locator(".gtile .sticker img").evaluateAll((els) => els.map((e) => e.getAttribute("src")?.slice(0, 20)))));
} catch (e) {
  log("FAILED " + e.message.split("\n")[0]);
  await shot("cutout-failed");
} finally {
  log("errors: " + JSON.stringify(errors));
  await b.close();
}
