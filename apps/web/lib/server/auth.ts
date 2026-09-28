// Session + device tokens: "<userId>.<hmac>" signed with POOF_SESSION_SECRET.
// Server-only (node:crypto, env secrets).
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "poof_uid";
const ONE_YEAR = 60 * 60 * 24 * 365;
const USER_ID = /^usr_[a-z0-9]{8,40}$/;

function secret() {
  const s = process.env.POOF_SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("POOF_SESSION_SECRET is not set");
  return "poof-dev-secret-not-for-production";
}

export function hmac(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function newUserId() {
  // 16 chars of [a-z0-9]
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return "usr_" + [...randomBytes(16)].map((b) => alphabet[b % alphabet.length]).join("");
}

/** "<userId>.<hmac(userId)>" for the browser cookie. */
export const sessionToken = (userId: string) => `${userId}.${hmac(userId)}`;
/** "<userId>.<hmac('device:'+userId)>" for the Connector extension. */
export const deviceToken = (userId: string) => `${userId}.${hmac(`device:${userId}`)}`;

function verify(token: unknown, prefix: string): string | null {
  if (typeof token !== "string") return null;
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const userId = token.slice(0, i);
  if (!USER_ID.test(userId)) return null;
  return safeEqual(token.slice(i + 1), hmac(prefix + userId)) ? userId : null;
}
export const verifySession = (token: unknown) => verify(token, "");
export const verifyDevice = (token: unknown) => verify(token, "device:");

/** The signed-in user from the cookie, or null. */
export async function currentUserId() {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function setSessionCookie(userId: string) {
  (await cookies()).set(SESSION_COOKIE, sessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}
