// Login security tests (33 checks): real local Supabase (Docker) + the app in real mode + an n8n stand-in.
// Run: npx supabase start; node supabase/tests/n8n-stub.mjs; then in apps/web, with NEXT_PUBLIC_MOCK=0
// N8N_WEBHOOK_BASE=http://127.0.0.1:3299 POOF_APP_KEY=test-app-key POOF_SESSION_SECRET=test-session-secret-123
// NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 + the local anon / service_role keys: npx next dev -p 3200;
// then node supabase/tests/login-security.mjs. The keys below are Supabase's fixed local-dev keys, not secrets.
// Note: local Supabase doesn't enforce the code-guess limit; the hosted project blocks after 30 wrong codes / 5 min / IP.

const APP = "http://localhost:3200", SB = "http://127.0.0.1:54321", MAIL = "http://127.0.0.1:54324";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SECRET = "test-session-secret-123";
const run = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (name, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

const sb = (path, body, key = ANON, ip) => fetch(SB + path, { method: body ? "POST" : "GET", headers: { apikey: ANON, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(ip ? { "X-Forwarded-For": ip } : {}) }, body: body && JSON.stringify(body) });
const app = (path, { body, cookie, origin = APP, method = "POST", type = "application/json" } = {}) =>
  fetch(APP + path, { method, redirect: "manual", headers: { "Content-Type": type, ...(origin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body && (typeof body === "string" ? body : JSON.stringify(body)) });
const cookieOf = (res) => (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).find((c) => c.startsWith("poof_uid=")) ?? null;
const uidOf = (cookie) => cookie && decodeURIComponent(cookie.slice(9)).split(".")[0];
const sign = (uid) => `poof_uid=${uid}.${createHmac("sha256", SECRET).update(uid).digest("base64url")}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function codeFor(email) {
  for (let i = 0; i < 20; i++) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent("to:" + email)}`)).json();
    const m = list.messages?.[0];
    if (m) {
      const full = await (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json();
      return { code: (full.Text || full.HTML).match(/\b\d{6}\b/)?.[0], subject: full.Subject, html: full.HTML };
    }
    await wait(300);
  }
  return {};
}
async function emailLogin(email, cookie) {
  const s = await sb("/auth/v1/otp", { email, create_user: true });
  const { code } = await codeFor(email);
  const v = await sb("/auth/v1/verify", { type: "email", email, token: code });
  const { access_token } = await v.json();
  const r = await app("/api/auth/session", { body: { accessToken: access_token }, cookie });
  return { sendStatus: s.status, code, token: access_token, res: r, json: await r.json(), cookie: cookieOf(r) };
}

// 1. Happy path
const a = `alice-${run}@test.dev`;
const A = await emailLogin(a);
ok("email code arrives and has 6 digits", /^\d{6}$/.test(A.code ?? ""), A.code);
const mail = await codeFor(a);
ok("branded email: subject carries the code", mail.subject === `Your poof code: ${A.code}`, mail.subject);
ok("login succeeds and sets the poof_uid cookie", A.res.status === 200 && !!A.cookie, `status ${A.res.status}`);
ok("new user is sent to onboarding", A.json.onboarded === false);
const acc = await (await app("/api/account", { method: "GET", cookie: A.cookie })).json();
ok("session cookie works: /api/account returns the user", acc.account?.userId === uidOf(A.cookie), acc.account?.userId);
ok("cookie is HttpOnly + SameSite=Lax", /HttpOnly/i.test(A.res.headers.get("set-cookie")) && /SameSite=lax/i.test(A.res.headers.get("set-cookie")));

// 2. The Supabase session is ended after login: replaying its token must not log anyone in again
const replay = await app("/api/auth/session", { body: { accessToken: A.token } });
ok("replaying the used Supabase token is refused", replay.status === 401, `status ${replay.status}`);

// 3. Same email again → same poof account
await wait(61_000); // resend limit is 60 s per email
const A2 = await emailLogin(a);
ok("same email logs in to the same poof account", uidOf(A2.cookie) === uidOf(A.cookie), `${uidOf(A2.cookie)} vs ${uidOf(A.cookie)}`);

// 4. Wrong / forged credentials
const b = `bob-${run}@test.dev`;
await sb("/auth/v1/otp", { email: b, create_user: true });
const { code: bCode } = await codeFor(b);
const wrong = String((Number(bCode) + 1) % 1e6).padStart(6, "0");
ok("wrong code is rejected by Supabase", (await sb("/auth/v1/verify", { type: "email", email: b, token: wrong })).status >= 400);
for (const [name, tok] of [["made-up token", "not-a-jwt"], ["anon key as token", ANON],
  ["token signed with a wrong secret", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImV4cCI6OTk5OTk5OTk5OX0.x3kX2o9h2GJ5Qxw8Vt8y0nC3hQyU5l1z5n5o8c9v0Ww"]]) {
  const r = await app("/api/auth/session", { body: { accessToken: tok } });
  ok(`${name} is refused`, r.status === 401 && !cookieOf(r), `status ${r.status}`);
}

// 5. Another site can't log you in (login CSRF) or out
const evil = await app("/api/auth/session", { body: { accessToken: A.token }, origin: "https://evil.example" });
ok("login from another site's page is refused (403)", evil.status === 403);
const plain = await app("/api/auth/session", { body: JSON.stringify({ accessToken: "x" }), origin: "https://evil.example", type: "text/plain" });
ok("…also as a no-preflight text/plain form post", plain.status === 403);
const noOrigin = await app("/api/auth/session", { body: { accessToken: "x" }, origin: null });
ok("…and with no Origin header", noOrigin.status === 403);
ok("logout from another site is refused", (await app("/api/auth/logout", { origin: "https://evil.example", cookie: A.cookie })).status === 403);

// 6. The link table is private
const anonRead = await sb("/rest/v1/poof_accounts?select=*");
const rows = await anonRead.json();
ok("public (anon) key can't read poof_accounts", Array.isArray(rows) ? rows.length === 0 : anonRead.status >= 400, `status ${anonRead.status}, ${JSON.stringify(rows).slice(0, 80)}`);
const anonWrite = await sb("/rest/v1/poof_accounts", { auth_id: "00000000-0000-0000-0000-000000000000", poof_uid: "usr_hijack0000" });
ok("public (anon) key can't write poof_accounts", anonWrite.status >= 400, `status ${anonWrite.status}`);
const userRead = await sb("/rest/v1/poof_accounts?select=*", null, A2.token);
const urows = await userRead.json().catch(() => null);
ok("a logged-in user's own token can't read it either", Array.isArray(urows) ? urows.length === 0 : userRead.status >= 400, `status ${userRead.status}`);

// 7. Cookies can't be forged or tampered with
const tampered = A.cookie.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
ok("tampered cookie is not a session", (await (await app("/api/account", { method: "GET", cookie: tampered })).json()).account === null);
ok("cookie for someone else's id without the secret is refused",
  (await (await app("/api/account", { method: "GET", cookie: `poof_uid=${uidOf(A.cookie)}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` })).json()).account === null);
ok("n8n proxy refuses requests without a session", (await app("/api/tba/items", { method: "GET", origin: null })).status === 401);

// 8. Accounts from before logins: adopted once, never twice
const legacy = "usr_legacy" + run.padEnd(8, "0");
const L1 = await emailLogin(`carol-${run}@test.dev`, sign(legacy));
ok("first login on a device adopts its pre-login account", uidOf(L1.cookie) === legacy, uidOf(L1.cookie));
const L2 = await emailLogin(`mallory-${run}@test.dev`, sign(legacy));
ok("a second login can't take over that (now linked) account", uidOf(L2.cookie) && uidOf(L2.cookie) !== legacy, uidOf(L2.cookie));
const L3 = await emailLogin(`dave-${run}@test.dev`, A.cookie);
ok("logging in while holding someone else's session doesn't steal it", uidOf(L3.cookie) !== uidOf(A.cookie), uidOf(L3.cookie));

// 9. Logout
const out = await app("/api/auth/logout", { cookie: A.cookie });
ok("logout clears the cookie", out.status === 200 && /poof_uid=;|Max-Age=0|expires=Thu, 01 Jan 1970/i.test(out.headers.get("set-cookie") ?? ""));

// 10. Google: PKCE, cancelled, forged callback
const g = await app("/api/auth/google", { method: "GET", origin: null });
const loc = g.headers.get("location") ?? "";
ok("Google start redirects to Supabase with a PKCE challenge", g.status === 303 && loc.startsWith(SB + "/auth/v1/authorize") && /code_challenge=/.test(loc) && /code_challenge_method=s256/.test(loc));
ok("…and keeps the verifier in an httpOnly cookie", /poof_pkce=.+HttpOnly/i.test(g.headers.get("set-cookie") ?? ""));
const cb1 = await app("/api/auth/google/callback?code=stolen-code", { method: "GET", origin: null });
ok("callback without this browser's verifier is refused (can't inject someone's code)", (cb1.headers.get("location") ?? "").endsWith("/login?error=expired") && !cookieOf(cb1));
const cb2 = await app("/api/auth/google/callback?code=forged", { method: "GET", origin: null, cookie: "poof_pkce=abc" });
ok("forged code is refused", (cb2.headers.get("location") ?? "").endsWith("/login?error=google") && !cookieOf(cb2));
const cb3 = await app("/api/auth/google/callback?error=access_denied", { method: "GET", origin: null });
ok("cancel on Google's screen comes back as 'cancelled'", (cb3.headers.get("location") ?? "").endsWith("/login?error=cancelled"));

// 11. Abuse limits (Supabase, per IP / per email)
const e = `eve-${run}@test.dev`;
await sb("/auth/v1/otp", { email: e, create_user: true });
const again = await sb("/auth/v1/otp", { email: e, create_user: true });
ok("asking for another code within 60 s is refused (no inbox flooding)", again.status === 429, `status ${again.status}`);
let tries = 0, limited = false;
for (; tries < 40; tries++) {
  const r = await sb("/auth/v1/verify", { type: "email", email: e, token: String(tries).padStart(6, "0") });
  if (r.status === 429) { limited = true; break; }
}
ok("guessing codes gets rate-limited", limited, `blocked after ${tries} wrong guesses`);

console.log(`\n${pass} passed, ${fail} failed`);
