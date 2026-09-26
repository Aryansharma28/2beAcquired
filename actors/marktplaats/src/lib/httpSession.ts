import { MpError, inputError } from './errors.js';
import { MpHttp } from './http.js';
import { proxyUrlFor } from './proxy.js';
import { DEFAULT_UA, jarFromState, loadSession, saveSession, stateFromJar, type StorageState } from './session.js';
import type { Input } from './types.js';

export interface HttpSession {
    http: MpHttp;
    state: StorageState | null;
    /** Run fn, then write refreshed cookies back, unless the session was rejected (never overwrite a
     *  maybe-still-good login with the anonymous cookies the site hands out after a 401). */
    use: <T>(fn: (http: MpHttp) => Promise<T>) => Promise<T>;
}

/** `required`: throw SESSION_EXPIRED when there is no stored login at all. */
export async function openHttpSession(input: Input, required: boolean): Promise<HttpSession> {
    // No default store: a missing sessionStore must never fall back to someone else's (the owner's) login.
    const storeName = input.sessionStore;
    if (required && !storeName) throw inputError("this action needs a sessionStore (the user's own Marktplaats session)");
    const state = storeName ? await loadSession(storeName) : null;
    if (required && !state) {
        throw new MpError(
            'SESSION_EXPIRED',
            `no stored session in KV store '${storeName}' (key 'state'); run scripts/mp-login first`,
        );
    }
    const jar = await jarFromState(state);
    const http = new MpHttp(jar, state?.meta?.userAgent || DEFAULT_UA, await proxyUrlFor(input.useProxy, input.sessionStore));
    return {
        http,
        state,
        use: async (fn) => {
            let rejected = false;
            try {
                return await fn(http);
            } catch (err) {
                rejected = err instanceof MpError && ['SESSION_EXPIRED', 'CAPTCHA'].includes(err.code);
                throw err;
            } finally {
                if (state && storeName && !rejected) await saveSession(storeName, await stateFromJar(jar, state));
            }
        },
    };
}
