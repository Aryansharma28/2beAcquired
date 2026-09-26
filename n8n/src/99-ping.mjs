import { Workflow, webhook, respond, tableInsert, tableGet } from "../lib.mjs";

// Smoke test: proves webhook + data table wiring.
export default () => {
  const w = new Workflow("TBA · Ping");
  w.add("Ping", webhook("tba/ping", "GET"));
  w.add("Log event", tableInsert("events", {
    itemId: "ping", ts: "={{ $now.toISO() }}", type: "step", text: "ping", meta: "{}",
  }));
  w.add("Read back", tableGet("events", { itemId: "ping" }));
  w.add("Respond", respond("={{ { ok: true, rows: $input.all().length } }}"));
  w.chain("Ping", "Log event", "Read back", "Respond");
  return w;
};
