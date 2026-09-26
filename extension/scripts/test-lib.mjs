// Unit tests for lib.js. Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MIN_GAP_MS,
  isMarktplaatsDomain,
  isValidCode,
  mapCookies,
  mapSameSite,
  normalizeCode,
  normalizePoofUrl,
  originPattern,
  parseMpUser,
  relativeTime,
  serverMessage,
  shouldRefreshAfterChange,
  toPlaywrightCookie,
} from "../lib.js";

test("code validation", () => {
  assert.equal(isValidCode("123456"), true);
  assert.equal(isValidCode("000000"), true);
  for (const bad of ["12345", "1234567", "12345a", " 123456", "", null, undefined, 123456, "١٢٣٤٥٦"]) {
    assert.equal(isValidCode(bad), false, `rejects ${JSON.stringify(bad)}`);
  }
  assert.equal(normalizeCode("12 34-56"), "123456");
  assert.equal(normalizeCode("Code: 482913!"), "482913");
  assert.equal(normalizeCode("12345678"), "123456");
  assert.equal(normalizeCode(null), "");
});

test("sameSite mapping", () => {
  assert.equal(mapSameSite("strict"), "Strict");
  assert.equal(mapSameSite("lax"), "Lax");
  assert.equal(mapSameSite("no_restriction"), "None");
  assert.equal(mapSameSite("unspecified"), "Lax");
  assert.equal(mapSameSite(undefined), "Lax");
});

test("cookie -> Playwright format", () => {
  const c = toPlaywrightCookie({
    name: "MpSession", value: "abc", domain: ".marktplaats.nl", path: "/", expirationDate: 1790000000.5,
    httpOnly: true, secure: true, sameSite: "no_restriction", session: false, hostOnly: false, storeId: "0",
  });
  assert.deepEqual(c, {
    name: "MpSession", value: "abc", domain: ".marktplaats.nl", path: "/", expires: 1790000000.5,
    httpOnly: true, secure: true, sameSite: "None",
  });
  const s = toPlaywrightCookie({ name: "x", value: "y", domain: "www.marktplaats.nl", path: "/a", session: true, httpOnly: false, secure: false, sameSite: "unspecified" });
  assert.equal(s.expires, -1);
  assert.equal(s.sameSite, "Lax");
  assert.equal(Object.keys(s).length, 8, "no chrome-only fields leak through");
});

test("only marktplaats.nl cookies are sent", () => {
  const out = mapCookies([
    { name: "a", value: "1", domain: ".marktplaats.nl", path: "/" },
    { name: "b", value: "2", domain: "www.marktplaats.nl", path: "/" },
    { name: "c", value: "3", domain: "evilmarktplaats.nl", path: "/" },
    { name: "d", value: "4", domain: "marktplaats.nl.evil.com", path: "/" },
    { name: "e", value: "5", domain: ".google.com", path: "/" },
    null,
  ]);
  assert.deepEqual(out.map((c) => c.name), ["a", "b"]);
  assert.equal(isMarktplaatsDomain("MARKTPLAATS.NL"), true);
  assert.equal(isMarktplaatsDomain("fakemarktplaats.nl"), false);
});

test("poof URL: https anywhere, http only for localhost", () => {
  assert.equal(normalizePoofUrl("https://poof-app.vercel.app/"), "https://poof-app.vercel.app");
  assert.equal(normalizePoofUrl("https://poof.example.com/some/path?x=1"), "https://poof.example.com");
  assert.equal(normalizePoofUrl("http://localhost:3000"), "http://localhost:3000");
  assert.equal(normalizePoofUrl("http://127.0.0.1:3000/"), "http://127.0.0.1:3000");
  assert.equal(normalizePoofUrl("http://poof-app.vercel.app"), null);
  assert.equal(normalizePoofUrl("http://localhost.evil.com"), null);
  assert.equal(normalizePoofUrl("https://user:pw@poof.app"), null);
  assert.equal(normalizePoofUrl("javascript:alert(1)"), null);
  assert.equal(normalizePoofUrl("not a url"), null);
  assert.equal(originPattern("http://localhost:3000"), "http://localhost/*");
  assert.equal(originPattern("https://poof-app.vercel.app"), "https://poof-app.vercel.app/*");
});

test("Marktplaats identity parsing", () => {
  assert.deepEqual(parseMpUser({ id: 42, name: "Aryan" }), { id: "42", name: "Aryan" });
  assert.deepEqual(parseMpUser({ user: { userId: "7", displayName: "A S" } }), { id: "7", name: "A S" });
  assert.deepEqual(parseMpUser({ id: 9 }), { id: "9", name: "User 9" });
  assert.equal(parseMpUser({}), null);
  assert.equal(parseMpUser(null), null);
});

test("relative time", () => {
  const now = 1_000_000_000_000;
  assert.equal(relativeTime(null, now), "never");
  assert.equal(relativeTime(now - 10e3, now), "just now");
  assert.equal(relativeTime(now - 5 * 60e3, now), "5 min ago");
  assert.equal(relativeTime(now - 3 * 3600e3, now), "3 h ago");
  assert.equal(relativeTime(now - 26 * 3600e3, now), "1 day ago");
  assert.equal(relativeTime(now - 72 * 3600e3, now), "3 days ago");
});

test("refresh throttle", () => {
  const now = 5_000_000;
  assert.equal(shouldRefreshAfterChange({ sessionChanged: true, lastSync: now - 1000, now }), true);
  assert.equal(shouldRefreshAfterChange({ sessionChanged: false, lastSync: now - 1000, now }), false);
  assert.equal(shouldRefreshAfterChange({ sessionChanged: false, lastSync: now - MIN_GAP_MS, now }), true);
  assert.equal(shouldRefreshAfterChange({ sessionChanged: false, lastSync: null, now }), true);
});

test("server error messages", () => {
  assert.equal(serverMessage({ error: "Code expired" }, 410), "Code expired");
  assert.equal(serverMessage({ ok: false, message: "Nope" }, 400), "Nope");
  assert.match(serverMessage(null, 404), /expired/);
  assert.match(serverMessage(null, 0), /network/);
});
