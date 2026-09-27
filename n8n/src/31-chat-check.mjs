import { Workflow, code, CREDS } from "../lib.mjs";

// W3b · Chat check: every CHAT_CHECK_SECONDS (default 5) ask the laptop runner for Marktplaats' unread-message counter
// (one small request made with the owner's session from the laptop, never from the cloud). When it goes up, run the
// inbox (W3) right away, which reads the chat and replies; W3's own schedule stays the safety net. Soft-fails while the
// laptop is offline. Successful runs are not saved (17,280 a day at 5 s would bury the execution list).
// On with CHAT_CHECK_N8N=1, which also turns off the laptop runner's own watcher (local-runner.mjs) so a message is
// never answered twice. Without it, the laptop watcher checks every WATCH_SECONDS instead and this workflow is off.
export default (env) => {
  const every = Math.max(1, Number(env.CHAT_CHECK_SECONDS) || 5);
  const w = new Workflow(`poof · 3b Chat check (every ${every} s)`);
  w.settings.saveDataSuccessExecution = "none";
  w.active = !!env.LOCAL_RUNNER_URL && env.CHAT_CHECK_N8N === "1";
  w.add("Every few seconds", ["n8n-nodes-base.scheduleTrigger", 1.2, { rule: { interval: [{ field: "seconds", secondsInterval: every }] } }]);
  w.add("Unread on Marktplaats (laptop)", [
    "n8n-nodes-base.httpRequest", 4.2,
    {
      method: "GET", url: `${(env.LOCAL_RUNNER_URL || "").replace(/\/+$/, "")}/unread`,
      sendHeaders: true, headerParameters: { parameters: [{ name: "X-Runner-Key", value: env.RUNNER_KEY || "" }] },
      options: { timeout: 12000 },
    },
    { onError: "continueRegularOutput" },
  ]);
  // Run the inbox when the count rises (or on the first check if messages are already waiting). One run per 20 s: a
  // message that lands inside that window is remembered and gets its own run as soon as the window has passed.
  w.add("New message?", code(`
const s = $getWorkflowStaticData('global');
const unread = $input.first().json.unread;
if (typeof unread !== 'number') return [];
const prev = s.lastCount;
s.lastCount = unread;
if (unread === 0) s.pending = false;
else if (prev == null || unread > prev) s.pending = true;
if (s.pending && Date.now() - (s.lastPoke || 0) > 20000) {
  s.pending = false;
  s.lastPoke = Date.now();
  return [{ json: { unread, previous: prev ?? null } }];
}
return [];`));
  w.add("Run inbox now", [
    "n8n-nodes-base.httpRequest", 4.2,
    {
      method: "POST", url: `${env.N8N_BASE_URL}/webhook/tba/inbox-now`,
      authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth",
      sendBody: true, specifyBody: "json", jsonBody: "{}", options: { timeout: 15000 },
    },
    { ...(CREDS.appKey ? { credentials: { httpHeaderAuth: { id: CREDS.appKey.id, name: CREDS.appKey.name } } } : {}), onError: "continueRegularOutput" },
  ]);
  w.chain("Every few seconds", "Unread on Marktplaats (laptop)", "New message?", "Run inbox now");
  return w;
};
