// eBay Marketplace Account Deletion notifications (required for production eBay API keys).
// GET: eBay's challenge → respond with sha256(challengeCode + verificationToken + endpoint) as hex.
// POST: a user deleted their eBay account → acknowledge with 200 (poof forgets their eBay link).
import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";

const endpoint = () => process.env.EBAY_DELETION_ENDPOINT ?? "https://poof-lovat.vercel.app/api/ebay/account-deletion";

export async function GET(req: Request) {
  const challengeCode = new URL(req.url).searchParams.get("challenge_code");
  const token = process.env.EBAY_VERIFICATION_TOKEN;
  if (!challengeCode || !token) return Response.json({ error: "missing challenge_code or token" }, { status: 400 });
  const challengeResponse = createHash("sha256").update(challengeCode + token + endpoint()).digest("hex");
  return Response.json({ challengeResponse });
}

export async function POST(req: Request) {
  // Body: { metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION" }, notification: { data: { username, userId, eiasToken } } }
  const body = await req.json().catch(() => null);
  const userId = body?.notification?.data?.userId;
  if (userId && process.env.N8N_WEBHOOK_BASE && process.env.POOF_APP_KEY) {
    await fetch(`${process.env.N8N_WEBHOOK_BASE}/tba/ebay-deleted`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Poof-Key": process.env.POOF_APP_KEY },
      body: JSON.stringify({ ebayUserId: userId }),
    }).catch(() => {});
  }
  return new Response(null, { status: 200 });
}
