import { Actor, log } from 'apify';
import { Cookie, CookieJar } from 'tough-cookie';

/** Playwright's storageState cookie shape. */
export interface PwCookie {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number; // unix seconds, -1 = session cookie
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
}

export interface StorageState {
    cookies: PwCookie[];
    origins: { origin: string; localStorage: { name: string; value: string }[] }[];
    /** Written by scripts/mp-login; not part of Playwright's format and stripped before use. */
    meta?: { userAgent?: string; savedAt?: string; updatedAt?: string; source?: string };
}

export const SESSION_KEY = 'state';

export const DEFAULT_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

export async function loadSession(storeName: string): Promise<StorageState | null> {
    const store = await Actor.openKeyValueStore(storeName);
    const state = await store.getValue<StorageState>(SESSION_KEY);
    if (!state || !Array.isArray(state.cookies)) return null;
    const hasSession = state.cookies.some((c) => c.domain.includes('marktplaats.nl'));
    if (!hasSession) return null;
    return { cookies: state.cookies, origins: state.origins ?? [], meta: state.meta ?? {} };
}

export async function saveSession(storeName: string, state: StorageState): Promise<void> {
    const store = await Actor.openKeyValueStore(storeName);
    const meta = { ...(state.meta ?? {}), updatedAt: new Date().toISOString() };
    await store.setValue(SESSION_KEY, { ...state, meta });
    log.info(`Session written back to KV store '${storeName}' (${state.cookies.length} cookies).`);
}

/** Only the Playwright-native fields, for browser.newContext({ storageState }). */
export function playwrightState(state: StorageState): Omit<StorageState, 'meta'> {
    return { cookies: state.cookies, origins: state.origins };
}

// --- Playwright <-> tough-cookie ------------------------------------------------------

export async function jarFromState(state: StorageState | null): Promise<CookieJar> {
    const jar = new CookieJar(undefined, { looseMode: true, rejectPublicSuffixes: false });
    for (const c of state?.cookies ?? []) {
        const hostOnly = !c.domain.startsWith('.');
        const domain = c.domain.replace(/^\./, '');
        const cookie = new Cookie({
            key: c.name,
            value: c.value,
            domain,
            path: c.path || '/',
            expires: c.expires && c.expires > 0 ? new Date(c.expires * 1000) : 'Infinity',
            httpOnly: c.httpOnly,
            secure: c.secure,
            sameSite: (c.sameSite || 'Lax').toLowerCase(),
            hostOnly,
        });
        try {
            await jar.setCookie(cookie, `https://${domain}${c.path || '/'}`, { ignoreError: true });
        } catch {
            // a malformed cookie must never break the run
        }
    }
    return jar;
}

export async function stateFromJar(jar: CookieJar, base: StorageState): Promise<StorageState> {
    const serialized = await jar.serialize();
    const cookies: PwCookie[] = serialized.cookies.map((c) => {
        const expires =
            typeof c.expires === 'string' && c.expires !== 'Infinity' ? Math.floor(Date.parse(c.expires) / 1000) : -1;
        const sameSite = String(c.sameSite ?? 'lax').toLowerCase();
        return {
            name: String(c.key),
            value: String(c.value ?? ''),
            domain: c.hostOnly ? String(c.domain) : `.${c.domain}`,
            path: String(c.path ?? '/'),
            expires: Number.isFinite(expires) ? expires : -1,
            httpOnly: Boolean(c.httpOnly),
            secure: Boolean(c.secure),
            sameSite: sameSite === 'strict' ? 'Strict' : sameSite === 'none' ? 'None' : 'Lax',
        };
    });
    return { cookies, origins: base.origins, meta: base.meta };
}
