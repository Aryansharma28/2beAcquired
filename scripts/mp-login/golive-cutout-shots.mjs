// Go-live with a cutout, in mock mode under `next dev`: sell one item, wait for its cutout, approve, and capture
// frames of the go-live moment.  node scripts/mp-login/golive-cutout-shots.mjs <appUrl> <outDir> <photo.jpg>
import { launch } from "cloakbrowser";
import { mkdirSync } from "node:fs";
const [APP, out, photo] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const b = await launch({ headless: true });
const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
const btn = (n) => page.getByRole("button", { name: n }).first();
const log = (s) => console.log(new Date().toISOString().slice(11, 19), s);
try {
  await page.goto(APP + "/welcome", { waitUntil: "networkidle" });
  await btn(/get started/i).click();
  const inputs = page.locator("input:visible");
  await inputs.nth(0).fill("Aryan"); await inputs.nth(1).fill("Almere"); await inputs.nth(2).fill("1318 DJ Almere");
  await btn(/^next$/i).click(); await page.waitForTimeout(1500);
  const skip = btn(/skip for now|continue/i); if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.goto(APP + "/new", { waitUntil: "networkidle" });
  await page.locator("input[type=file]:not([capture])").setInputFiles(photo);
  await page.waitForTimeout(800); await btn(/^done$/i).click();
  await page.getByText(/is this it/i).first().waitFor({ timeout: 60000 });
  await btn(/yes, that/i).click();
  const t0 = Date.now();
  while (Date.now() - t0 < 45000 && !(await page.locator(".context img[src^='data:image/png']").count())) await page.waitForTimeout(1000);
  log("cutout ready: " + !!(await page.locator(".context img[src^='data:image/png']").count()));
  await page.screenshot({ path: `${out}/cutout-minimum.png` });
  await btn(/^next$/i).click(); await page.waitForTimeout(400);
  await btn(/create my ad/i).click();
  await btn(/approve and sell/i).waitFor({ timeout: 60000 });
  await btn(/approve and sell/i).click();
  const ta = Date.now();
  for (const ms of [400, 900, 1300, 1700, 2400, 3400]) {
    await page.waitForTimeout(Math.max(0, ms - (Date.now() - ta)));
    await page.screenshot({ path: `${out}/golive-cutout-${String(ms).padStart(4, "0")}ms.png` });
  }
  log("golive frames done; text: " + (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 160));
} catch (e) { log("FAILED " + e.message.split("\n")[0]); await page.screenshot({ path: `${out}/failed.png` }); }
finally { log("errors: " + JSON.stringify(errors)); await b.close(); }
