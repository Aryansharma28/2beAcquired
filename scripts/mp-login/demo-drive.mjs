// Drive the open demo browser one step at a time, 1 s between actions (slowMo), so it can be watched.
//   node scripts/mp-login/demo-drive.mjs <step> [arg]
import { chromium } from "playwright-core";

const [step, arg] = process.argv.slice(2);
const browser = await chromium.connectOverCDP("http://127.0.0.1:9444", { slowMo: 1000 });
const context = browser.contexts()[0];
const page = context.pages().find((p) => p.url().includes("poof")) ?? context.pages()[0];
const pause = (ms = 1000) => page.waitForTimeout(ms);
const click = async (loc) => { await loc.waitFor({ timeout: 60_000 }); await loc.scrollIntoViewIfNeeded(); await loc.click(); await pause(); };
const say = (s) => console.log(`• ${s}`);

const steps = {
  async onboard() {
    await page.goto("https://poof-lovat.vercel.app/", { waitUntil: "domcontentloaded" }); await pause(2000);
    if (!page.url().includes("/welcome")) return say(`already onboarded (${page.url()})`);
    await click(page.getByRole("button", { name: "Get started" })); say("Get started");
    const inputs = page.locator("main input");
    await inputs.nth(0).fill("Aryan"); await pause(); say("name");
    await inputs.nth(1).fill("Almere"); await pause(); say("pickup city");
    await inputs.nth(2).fill("1318 DJ Almere"); await pause(); say("pickup address");
    await click(page.getByRole("button", { name: "Weekend daytime" })); say("pickup hours");
    await click(page.getByRole("button", { name: /^Next$/ })); say("Next");
    await click(page.getByRole("button", { name: "Continue" })); say("Connected → Continue");
  },
  async photo() {
    await page.goto("https://poof-lovat.vercel.app/new", { waitUntil: "domcontentloaded" }); await pause(2000); say("Sell");
    await page.locator("input[type=file]:not([capture])").setInputFiles(arg); await pause(1500); say(`photo added: ${arg}`);
    await click(page.getByRole("button", { name: "Done" })); say("Done → poof is looking at it");
    await page.waitForURL(/\/item\//, { timeout: 60_000 }); say(page.url());
  },
  async fix() {
    await click(page.getByRole("button", { name: /Fix it/ })); say("Fix it");
    const input = page.locator("main input").first();
    await input.fill(""); await pause(500);
    await input.pressSequentially(arg, { delay: 60 }); await pause(); say(`typed "${arg}"`);
    await input.press("Enter"); await pause();
    await click(page.getByRole("button", { name: /Use this name/ })); say("Use this name → checking prices");
    await page.getByText("When should it be gone", { exact: false }).or(page.getByText("1/4", { exact: true })).first().waitFor({ timeout: 5000 }).catch(() => {});
  },
  async fill() {
    const input = page.locator("main input").first();
    await input.click(); await input.fill(""); await pause(500);
    await input.pressSequentially(arg, { delay: 60 }); await pause(); say(`typed "${arg}"`);
  },
  async where() { say(page.url()); say((await page.locator("main").innerText()).slice(0, 600)); },
  async clickText() { await click(page.getByText(arg, { exact: false }).first()); say(`clicked "${arg}"`); },
  async button() { await click(page.getByRole("button", { name: new RegExp(arg, "i") }).first()); say(`button "${arg}"`); },
};
await steps[step]();
await browser.close(); // disconnects only; the window stays open
