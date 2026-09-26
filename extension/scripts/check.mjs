// Static checks: manifest fields, permissions, every referenced file exists (incl.
// ES-module imports and HTML src/href), valid PNG icons of the right size, and no
// remote code/fonts in extension pages (MV3 CSP). Run: npm run check
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { POOF_URL } from "../config.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const fail = (m) => errors.push(m);
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const m = JSON.parse(read("manifest.json"));

// ---- fields ----
if (m.manifest_version !== 3) fail("manifest_version must be 3");
for (const k of ["name", "version", "description"]) if (!m[k]) fail(`missing ${k}`);
if (!/^\d+(\.\d+){0,3}$/.test(m.version)) fail(`bad version ${m.version}`);
if (m.description.length > 132) fail("description > 132 chars (Chrome Web Store limit)");
const perms = [...(m.permissions || [])].sort();
if (JSON.stringify(perms) !== JSON.stringify(["alarms", "cookies", "storage"])) fail(`permissions must be exactly cookies, storage, alarms (got ${perms})`);
const hosts = m.host_permissions || [];
if (!hosts.includes("https://*.marktplaats.nl/*")) fail("host_permissions missing https://*.marktplaats.nl/*");
const poofHost = `${new URL(POOF_URL).protocol}//${new URL(POOF_URL).hostname}/*`;
if (!hosts.includes(poofHost)) fail(`host_permissions missing ${poofHost} (POOF_URL in config.js)`);
for (const h of hosts) {
  if (h === "<all_urls>" || h.startsWith("*://") || h === "https://*/*") fail(`host_permissions too broad: ${h}`);
}
if (!m.background?.service_worker) fail("background.service_worker missing");
if (m.background?.type !== "module") fail("background.type must be module (background.js uses import)");
if (!m.action?.default_popup) fail("action.default_popup missing");
if (!m.browser_specific_settings?.gecko?.id) fail("browser_specific_settings.gecko.id missing (Firefox)");
if (/unsafe-eval|https?:/.test(m.content_security_policy?.extension_pages || "")) fail("CSP must not allow eval or remote sources");

// ---- referenced files ----
const refs = new Set([m.background.service_worker, ...(m.background.scripts || []), m.action.default_popup]);
for (const p of Object.values(m.icons || {})) refs.add(p);
for (const p of Object.values(m.action.default_icon || {})) refs.add(p);

// Follow HTML src/href and JS imports.
const queue = [...refs];
const seen = new Set();
while (queue.length) {
  const p = normalize(queue.shift()).replace(/\\/g, "/");
  if (seen.has(p)) continue;
  seen.add(p);
  if (!existsSync(join(ROOT, p))) {
    fail(`referenced file missing: ${p}`);
    continue;
  }
  const base = dirname(p);
  if (p.endsWith(".html")) {
    const html = read(p);
    for (const [, url] of html.matchAll(/\s(?:src|href)="([^"]+)"/g)) {
      if (/^https?:|^\/\//.test(url)) fail(`${p}: remote resource ${url} (not allowed in MV3)`);
      else if (!url.startsWith("#")) queue.push(join(base, url));
    }
  } else if (p.endsWith(".js")) {
    const js = read(p);
    for (const [, spec] of js.matchAll(/(?:^|\n)\s*import\s[^;]*?from\s+"([^"]+)"/g)) {
      if (!spec.startsWith("./")) fail(`${p}: non-relative import ${spec}`);
      else queue.push(join(base, spec));
    }
    if (/\beval\(|new Function\(/.test(js)) fail(`${p}: eval/new Function`);
    if (/console\.\w+\([^)]*\b(value|cookies)\b(?![.]length)/.test(js)) fail(`${p}: possible logging of cookie values`);
  } else if (p.endsWith(".css")) {
    if (/@import|url\(\s*["']?https?:/.test(read(p))) fail(`${p}: remote CSS/font`);
  }
}

// ---- icons are real PNGs with matching sizes ----
for (const [size, p] of Object.entries(m.icons || {})) {
  if (!existsSync(join(ROOT, p))) continue;
  const b = readFileSync(join(ROOT, p));
  const sig = b.subarray(0, 8).toString("hex");
  if (sig !== "89504e470d0a1a0a") fail(`${p}: not a PNG`);
  else if (b.readUInt32BE(16) !== +size || b.readUInt32BE(20) !== +size) fail(`${p}: expected ${size}x${size}, got ${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`);
}

if (errors.length) {
  console.error("✗ extension check failed:\n  - " + errors.join("\n  - "));
  process.exit(1);
}
console.log(`✓ manifest ok · ${seen.size} referenced files present · POOF_URL ${POOF_URL}`);
console.log("  " + [...seen].sort().join(", "));
