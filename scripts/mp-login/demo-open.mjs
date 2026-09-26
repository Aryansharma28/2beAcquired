// Visible CloakBrowser for watching the poof flow. Stays open; demo-drive.mjs connects to it over CDP (port 9444).
//   node scripts/mp-login/demo-open.mjs
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchPersistentContext } from "cloakbrowser";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const context = await launchPersistentContext({
  userDataDir: join(root, ".mp-session", "poof-demo-profile"),
  headless: false,
  viewport: { width: 430, height: 900 },
  args: ["--remote-debugging-port=9444", "--window-size=470,1000", "--window-position=40,20"],
});
const page = context.pages()[0] ?? (await context.newPage());
await page.goto("https://poof-lovat.vercel.app/", { waitUntil: "domcontentloaded" });
console.log("OPEN");
await new Promise((r) => context.on("close", r));
