// Open the logged-in CloakBrowser profile (from mp-login) on a Marktplaats page, for looking around by hand.
//   node scripts/mp-login/open-cloak.mjs [url]
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchPersistentContext } from "cloakbrowser";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const url = process.argv[2] ?? "https://www.marktplaats.nl/my-account/sell/index.html";
const context = await launchPersistentContext({
  userDataDir: join(root, ".mp-session", "cloak-profile"),
  headless: false, viewport: null, locale: "nl-NL", timezone: "Europe/Amsterdam", args: ["--start-maximized"],
});
const page = context.pages()[0] ?? (await context.newPage());
await page.goto(url, { waitUntil: "domcontentloaded" });
console.log(`CloakBrowser open on ${url}. Close the window when you're done.`);
await new Promise((r) => context.on("close", r));
