// Open a URL in a new tab of the demo browser (CDP 9444) and bring it to front.
import { chromium } from "playwright-core";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9444");
const page = await browser.contexts()[0].newPage();
await page.goto(process.argv[2], { waitUntil: "domcontentloaded" });
await page.bringToFront();
console.log("opened");
await browser.close();
