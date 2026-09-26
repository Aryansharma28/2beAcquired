import { deleteState, ensureStore, storeName } from "./apify";
import { n8n } from "./n8n";

/** Delete the saved Marktplaats session and clear the flag in n8n. */
export async function disconnectUser(userId: string) {
  try {
    await deleteState(await ensureStore(storeName(userId)));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const r = await n8n("mp-disconnected", { method: "POST", userId, body: { userId } });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
