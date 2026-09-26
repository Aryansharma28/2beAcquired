// Passive recorder: while you place (and delete) one ad by hand in the clean Chrome from clean-login.mjs,
// capture Marktplaats' own write requests so the agent can replay them over HTTP.
// Only the Network domain is enabled (no Runtime/JS injection), so the page can't tell.
//
//   node scripts/mp-login/record-post.mjs      (Ctrl+C when done; writes .mp-session/capture.json)
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(root, ".mp-session", "capture.json");
const v = await (await fetch("http://127.0.0.1:9333/json/version")).json();
const ws = new WebSocket(v.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
const send = (method, params = {}, sessionId) => new Promise((res) => {
  const i = ++id; pending.set(i, res);
  ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
});
const reqs = new Map();
const captured = [];
const save = () => writeFileSync(OUT, JSON.stringify(captured, null, 2));
const interesting = (r) => /marktplaats\.nl/.test(r.url) && !/\.(js|css|png|jpe?g|webp|svg|woff2?)(\?|$)/.test(r.url)
  && (r.method !== "GET" || /api|json|rpc/.test(r.url));

ws.onmessage = async (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); return; }
  if (d.method === "Target.attachedToTarget") {
    const sid = d.params.sessionId;
    await send("Network.enable", { maxPostDataSize: 5_000_000 }, sid);
    await send("Runtime.runIfWaitingForDebugger", {}, sid);
  }
  if (d.method === "Network.requestWillBeSent" && interesting(d.params.request)) {
    reqs.set(d.params.requestId, { sid: d.sessionId, method: d.params.request.method, url: d.params.request.url,
      headers: d.params.request.headers, postData: d.params.request.postData?.slice(0, 20000), hasPostData: d.params.request.hasPostData });
  }
  if (d.method === "Network.responseReceived" && reqs.has(d.params.requestId)) {
    reqs.get(d.params.requestId).status = d.params.response.status;
  }
  if (d.method === "Network.loadingFinished" && reqs.has(d.params.requestId)) {
    const r = reqs.get(d.params.requestId); reqs.delete(d.params.requestId);
    const body = await send("Network.getResponseBody", { requestId: d.params.requestId }, r.sid).catch(() => null);
    r.response = body?.body?.slice(0, 20000);
    delete r.sid;
    captured.push(r); save();
    console.log(`${r.method} ${r.status} ${r.url.slice(0, 140)}`);
  }
};
await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
const { targetInfos } = await send("Target.getTargets");
for (const t of targetInfos.filter((t) => t.type === "page")) await send("Target.attachToTarget", { targetId: t.targetId, flatten: true });
console.log(`Recording Marktplaats requests → ${OUT}. Place one ad (and delete it) in the Chrome window, then Ctrl+C.`);
