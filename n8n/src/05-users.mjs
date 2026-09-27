import { Workflow, webhook, respond, code, tableGet, tableUpsert, tableInsert, tableUpdate, ifTrue, callWorkflow } from "../lib.mjs";

// Accounts + "Connect Marktplaats" pairing. All endpoints are called by the poof app's server (X-Poof-Key),
// which forwards the signed-in user as X-Poof-User.
// DEMO_MP_STORE (e.g. mp-session): every account counts as connected and sells on that one owner session.
const me = (env) => `const DEMO = ${JSON.stringify(env.DEMO_MP_STORE || '')}, DEMO_NAME = ${JSON.stringify(env.DEMO_MP_NAME || 'Marktplaats')};
const u = (row) => { const d = row && row.data ? JSON.parse(row.data) : {};
  const hours = Array.isArray(d.pickupHours) ? d.pickupHours : (d.pickupHours ? [d.pickupHours] : []);
  return { userId: row?.userId, name: d.name || '', onboarded: !!d.onboarded,
    pickupCity: d.pickupCity || '', pickupAddress: d.pickupAddress || '', pickupHours: hours,
    mpConnected: !!d.mpConnected || !!DEMO, mpName: d.mpName || (DEMO ? DEMO_NAME : null), connectedAt: d.connectedAt || null }; };`;

export default (env, ids) => {
  const ME = me(env);
  const w = new Workflow("poof · Accounts + connect", { errorWorkflow: ids.error });
  let y = 0;
  const lane = () => { w.x = 0; y += 360; return y; };

  // POST /tba/push-subscribe { subscription, remove? } — remember (or forget) this phone for push notifications
  // (W7 sends them). Keyed by the subscription endpoint; at most 5 phones per account.
  w.add("Push subscribe", webhook("tba/push-subscribe"), { y });
  w.add("User for push", tableGet("users", { userId: "={{ $json.headers['x-poof-user'] }}" }), { y, executeOnce: true });
  w.add("Add phone", code(`
const req = $('Push subscribe').first().json;
const userId = req.headers['x-poof-user'];
if (!userId) throw new Error('No user');
const b = req.body || {};
const s = b.subscription || {};
if (!s.endpoint || !String(s.endpoint).startsWith('https://') || !s.keys || !s.keys.p256dh || !s.keys.auth) throw new Error('Not a push subscription');
const row = $input.all().map(i => i.json).find(r => r.userId === userId);
const d = row && row.data ? JSON.parse(row.data) : {};
const rest = (d.push || []).filter(x => x.endpoint !== s.endpoint);
d.push = b.remove ? rest : [...rest, { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, at: new Date().toISOString() }].slice(-5);
return [{ json: { userId, data: JSON.stringify(d), count: d.push.length } }];`), { y });
  w.add("Save phone", tableUpsert("users", { userId: "={{ $json.userId }}" }, { userId: "={{ $json.userId }}", status: "active", data: "={{ $json.data }}" }), { y });
  w.add("Phone saved", respond("={{ { ok: true, phones: $('Add phone').first().json.count } }}"), { y });
  w.chain("Push subscribe", "User for push", "Add phone", "Save phone", "Phone saved");
  lane();

  // POST /tba/users — create the account row (idempotent)
  w.add("Create account", webhook("tba/users"), { y });
  w.add("Existing?", tableGet("users", { userId: "={{ $json.headers['x-poof-user'] }}" }), { y, executeOnce: true });
  w.add("Keep or new", code(`
const userId = $('Create account').first().json.headers['x-poof-user'];
if (!/^usr_[A-Za-z0-9_-]{6,40}$/.test(userId || '')) throw new Error('Bad user id');
const row = $input.all().map(i => i.json).find(r => r.userId);
if (row) return [{ json: { userId, data: row.data } }];
// First visit may carry the onboarding profile already.
const b = $('Create account').first().json.body || {};
const d = { createdAt: new Date().toISOString() };
for (const k of ['name', 'pickupCity', 'pickupAddress']) if (typeof b[k] === 'string') d[k] = b[k].slice(0, 160);
if (Array.isArray(b.pickupHours)) d.pickupHours = b.pickupHours.filter(h => typeof h === 'string').slice(0, 6);
return [{ json: { userId, data: JSON.stringify(d) } }];`), { y });
  w.add("Upsert user", tableUpsert("users", { userId: "={{ $json.userId }}" }, { userId: "={{ $json.userId }}", status: "active", data: "={{ $json.data }}" }), { y });
  w.add("Created", respond("={{ { ok: true, userId: $('Keep or new').first().json.userId } }}"), { y });
  w.chain("Create account", "Existing?", "Keep or new", "Upsert user", "Created");

  // GET /tba/me
  lane();
  w.add("Get me", webhook("tba/me", "GET"), { y });
  w.add("My row", tableGet("users", { userId: "={{ $json.headers['x-poof-user'] }}" }), { y, executeOnce: true });
  w.add("Shape me", code(ME + `
const row = $input.all().map(i => i.json).find(r => r.userId);
if (!row) return [{ json: { error: 'no_account' } }];
return [{ json: u(row) }];`), { y });
  w.add("Me", respond(), { y });
  w.chain("Get me", "My row", "Shape me", "Me");

  // POST /tba/me — update profile / onboarding
  lane();
  w.add("Update me", webhook("tba/me"), { y });
  w.add("Current row", tableGet("users", { userId: "={{ $json.headers['x-poof-user'] }}" }), { y, executeOnce: true });
  w.add("Merge profile", code(ME + `
const req = $('Update me').first().json;
const b = req.body || {};
const row = $input.all().map(i => i.json).find(r => r.userId) || { userId: req.headers['x-poof-user'], data: '{}' };
const d = JSON.parse(row.data || '{}');
for (const [k, max] of [['name', 60], ['pickupCity', 60], ['pickupAddress', 160]]) if (typeof b[k] === 'string') d[k] = b[k].slice(0, max);
if (Array.isArray(b.pickupHours)) d.pickupHours = b.pickupHours.filter(h => typeof h === 'string').slice(0, 6).map(h => h.slice(0, 40));
if (typeof b.onboarded === 'boolean') d.onboarded = b.onboarded;
return [{ json: { userId: row.userId, data: JSON.stringify(d), me: u({ userId: row.userId, data: JSON.stringify(d) }) } }];`), { y });
  w.add("Save profile", tableUpsert("users", { userId: "={{ $json.userId }}" }, { userId: "={{ $json.userId }}", status: "active", data: "={{ $json.data }}" }), { y });
  w.add("Updated", respond("={{ $('Merge profile').first().json.me }}"), { y });
  w.chain("Update me", "Current row", "Merge profile", "Save profile", "Updated");

  // POST /tba/pair/new — 6-digit code, 15 minutes
  lane();
  w.add("New code", webhook("tba/pair/new"), { y });
  w.add("Make code", code(`
const userId = $json.headers['x-poof-user'];
if (!userId) throw new Error('No user');
const code = String(Math.floor(100000 + Math.random() * 900000));
return [{ json: { code, userId, expiresAt: new Date(Date.now() + 15 * 60e3).toISOString(), claimed: 'no' } }];`), { y });
  w.add("Store code", tableInsert("pairings", { code: "={{ $json.code }}", userId: "={{ $json.userId }}", expiresAt: "={{ $json.expiresAt }}", claimed: "no" }), { y });
  w.add("Code", respond("={{ { code: $('Make code').first().json.code, expiresAt: $('Make code').first().json.expiresAt } }}"), { y });
  w.chain("New code", "Make code", "Store code", "Code");

  // POST /tba/pair/claim {code} — the extension (via the app server) trades a code for the userId
  lane();
  w.add("Claim code", webhook("tba/pair/claim"), { y });
  w.add("Find code", tableGet("pairings", { code: "={{ String($json.body.code || '').replace(/[^0-9]/g, '') }}" }), { y, executeOnce: true });
  w.add("Check code", code(`
const now = Date.now();
const p = $input.all().map(i => i.json).filter(r => r.code).reverse().find(r => r.claimed !== 'yes' && Date.parse(r.expiresAt) > now);
return [{ json: p ? { ok: true, userId: p.userId, code: p.code } : { ok: false } }];`), { y });
  w.add("Valid?", ifTrue("={{ $json.ok }}"), { y });
  w.add("Mark claimed", tableUpdate("pairings", { code: "={{ $('Check code').first().json.code }}" }, { claimed: "yes" }), { y });
  w.add("Claimed", respond("={{ { userId: $('Check code').first().json.userId } }}"), { y });
  w.chain("Claim code", "Find code", "Check code", "Valid?", "Mark claimed", "Claimed");
  w.add("Invalid code", respond("={{ { error: 'This code is wrong or expired. Get a new one in the poof app.' } }}", 404), { position: [1040, y + 200] });
  w.link("Valid?", "Invalid code", 1);

  // POST /tba/mp-connected {userId, name, store} — then put any ads that were waiting for it online
  lane();
  w.add("Marktplaats connected", webhook("tba/mp-connected"), { y });
  w.add("User row", tableGet("users", { userId: "={{ $json.body.userId }}" }), { y, executeOnce: true });
  w.add("Set connected", code(`
const b = $('Marktplaats connected').first().json.body;
const row = $input.all().map(i => i.json).find(r => r.userId) || { userId: b.userId, data: '{}' };
const d = JSON.parse(row.data || '{}');
Object.assign(d, { mpConnected: true, mpName: b.name || d.mpName || null, mpStore: b.store, connectedAt: new Date().toISOString() });
return [{ json: { userId: b.userId, data: JSON.stringify(d) } }];`), { y });
  w.add("Save connected", tableUpsert("users", { userId: "={{ $json.userId }}" }, { userId: "={{ $json.userId }}", status: "active", data: "={{ $json.data }}" }), { y });
  w.add("Connected", respond("={{ { ok: true } }}"), { y });
  w.add("User items", tableGet("items"), { y, executeOnce: true });
  w.add("Waiting for connection", code(`
const userId = $('Set connected').first().json.userId;
const store = $('Marktplaats connected').first().json.body.store;
if (!store) return [];
// Approve saved mpStore = null while the user was not connected: give each waiting ad this user's own session.
return $input.all().map(i => i.json).filter(r => r.status === 'needs_connection' && JSON.parse(r.data || '{}').ownerId === userId)
  .map(r => { const d = JSON.parse(r.data); d.mpStore = store; d.status = 'ad_ready'; return { json: { itemId: r.itemId, data: JSON.stringify(d) } }; });`), { y });
  w.add("Back to ad_ready", tableUpdate("items", { itemId: "={{ $json.itemId }}" }, { status: "ad_ready", data: "={{ $json.data }}" }), { y });
  w.add("Publish waiting ads", callWorkflow(ids.publish, { each: true }), { y });
  w.chain("Marktplaats connected", "User row", "Set connected", "Save connected", "Connected", "User items", "Waiting for connection", "Back to ad_ready", "Publish waiting ads");

  // POST /tba/mp-disconnected {userId}
  lane();
  w.add("Marktplaats disconnected", webhook("tba/mp-disconnected"), { y });
  w.add("User row (disconnect)", tableGet("users", { userId: "={{ $json.body.userId }}" }), { y, executeOnce: true });
  w.add("Set disconnected", code(`
const b = $('Marktplaats disconnected').first().json.body;
const row = $input.all().map(i => i.json).find(r => r.userId);
if (!row) return [{ json: { userId: b.userId, data: '{}' } }];
const d = JSON.parse(row.data || '{}');
Object.assign(d, { mpConnected: false, disconnectedAt: new Date().toISOString() });
return [{ json: { userId: row.userId, data: JSON.stringify(d) } }];`), { y });
  w.add("Save disconnected", tableUpsert("users", { userId: "={{ $json.userId }}" }, { userId: "={{ $json.userId }}", status: "active", data: "={{ $json.data }}" }), { y });
  w.add("Disconnected", respond("={{ { ok: true } }}"), { y });
  w.chain("Marktplaats disconnected", "User row (disconnect)", "Set disconnected", "Save disconnected", "Disconnected");
  return w;
};
