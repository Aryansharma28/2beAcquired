import { MpError } from './errors.js';
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
    const storeName = input.sessionStore || 'mp-session';
    const state = await loadSession(storeName);
    if (required && !state) {
        throw new MpError(
            'SESSION_EXPIRED',
            `no stored session in KV store '${storeName}' (key 'state'); run scripts/mp-login first`,
        );
    }
    const jar = await jarFromState(state);
    const http = new MpHttp(jar, state?.meta?.userAgent || DEFAULT_UA, await proxyUrlFor(input.useProxy));
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
                if (state && !rejected) await saveSession(storeName, await stateFromJar(jar, state));
            }
        },
    };
}
