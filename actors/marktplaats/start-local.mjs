// One command to make this laptop the place Marktplaats actions run (see docs/REQUIREMENTS.md):
// builds the actor, starts local-runner.mjs, opens a Cloudflare quick tunnel to it, writes the tunnel URL to
// .env as LOCAL_RUNNER_URL and redeploys the n8n workflows so they call it. Keep this running during the demo.
//
//   node actors/marktplaats/start-local.mjs
import { execSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const envFile = join(root, ".env");
const PORT = 8787;

if (!/^RUNNER_KEY=.{16,}/m.test(readFileSync(envFile, "utf8"))) {
  appendFileSync(envFile, `\n# Local runner (actors/marktplaats/local-runner.mjs)\nRUNNER_KEY=${randomBytes(24).toString("hex")}\n`);
  console.log("Created RUNNER_KEY in .env");
}

console.log("Building the actor…");
execSync("npm run build", { cwd: here, stdio: "inherit" });

const runner = spawn(process.execPath, [join(here, "local-runner.mjs")], { cwd: here, stdio: "inherit" });

console.log("Opening the Cloudflare tunnel…");
const tunnel = spawn("npx", ["-y", "cloudflared", "tunnel", "--no-autoupdate", "--url", `http://localhost:${PORT}`], {
  shell: true,
  stdio: ["ignore", "pipe", "pipe"],
});
const url = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("no tunnel URL after 60 s")), 60_000);
  const onData = (buf) => {
    const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) { clearTimeout(timer); resolve(m[0]); }
  };
  tunnel.stdout.on("data", onData);
  tunnel.stderr.on("data", onData);
});

for (let i = 0; i < 30; i++) {
  const ok = await fetch(`${url}/health`).then((r) => r.ok, () => false);
  if (ok) break;
  await new Promise((r) => setTimeout(r, 2000));
}

const env = readFileSync(envFile, "utf8").replace(/^LOCAL_RUNNER_URL=.*\n?/m, "");
writeFileSync(envFile, `${env.replace(/\n*$/, "\n")}LOCAL_RUNNER_URL=${url}\n`);
console.log(`Tunnel: ${url} (saved to .env). Redeploying n8n…`);
execSync("node n8n/deploy.mjs", { cwd: root, stdio: "inherit" });

console.log(`\n✓ Marktplaats actions now run on this laptop. Keep this window open; Ctrl+C stops the runner and tunnel.\n`);
const stop = () => { runner.kill(); tunnel.kill(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
