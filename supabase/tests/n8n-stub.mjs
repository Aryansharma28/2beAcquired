// Stand-in for the n8n account webhooks (tba/users, tba/me) so login tests never touch production data.
import http from "node:http";
const users = new Map();
const KEY = "test-app-key";
http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const send = (s, j) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(j)); };
    if (req.headers["x-poof-key"] !== KEY) return send(403, { error: "bad key" });
    const uid = req.headers["x-poof-user"];
    const b = body ? JSON.parse(body) : {};
    if (req.url === "/tba/users" && req.method === "POST") {
      if (!users.has(uid)) users.set(uid, { createdAt: new Date().toISOString(), ...(b.name ? { name: b.name } : {}) });
      return send(200, { ok: true, userId: uid });
    }
    if (req.url === "/tba/me" && req.method === "GET") return users.has(uid) ? send(200, { userId: uid, ...users.get(uid) }) : send(200, { error: "no_account" });
    if (req.url === "/tba/me" && req.method === "POST") { users.set(uid, { ...users.get(uid), ...b }); return send(200, { ok: true }); }
    if (req.url === "/_dump") return send(200, Object.fromEntries(users));
    send(404, { error: "not found" });
  });
}).listen(3299, () => console.log("n8n stub on 3299"));
