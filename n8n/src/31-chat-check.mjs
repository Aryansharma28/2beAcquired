import { Workflow, code, CREDS } from "../lib.mjs";

// W3b · Chat check: every 15 s ask the laptop runner for Marktplaats' unread-message counter (one small request made
// with the owner's session from the laptop, never from the cloud). When it goes up, run the inbox (W3) right away;
// W3's own schedule stays the safety net. Soft-fails while the laptop is offline. Successful runs are not saved
// (5,760 a day would bury the execution list).
export default (env) => {
  const w = new Workflow("poof · 3b Chat check (every 15 s)");
  w.settings.saveDataSuccessExecution = "none";
  w.active = !!env.LOCAL_RUNNER_URL;
  w.add("Every 15 s", ["n8n-nodes-base.scheduleTrigger", 1.2, { rule: { interval: [{ field: "seconds", secondsInterval: 15 }] } }]);
  w.add("Unread on Marktplaats (laptop)", [
    "n8n-nodes-base.httpRequest", 4.2,
    {
      method: "GET", url: `${(env.LOCAL_RUNNER_URL || "").replace(/\/+$/, "")}/unread`,
      sendHeaders: true, headerParameters: { parameters: [{ name: "X-Runner-Key", value: env.RUNNER_KEY || "" }] },
      options: { timeout: 12000 },
    },
    { onError: "continueRegularOutput" },
  ]);
  // Poke only when the count rises (or on the first check if messages are already waiting), at most every 30 s.
  w.add("New message?", code(`
const s = $getWorkflowStaticData('global');
const unread = $input.first().json.unread;
if (typeof unread !== 'number') return [];
const prev = s.lastCount;
s.lastCount = unread;
if (unread > 0 && (prev == null || unread > prev) && Date.now() - (s.lastPoke || 0) > 30000) {
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
  w.chain("Every 15 s", "Unread on Marktplaats (laptop)", "New message?", "Run inbox now");
  return w;
};
