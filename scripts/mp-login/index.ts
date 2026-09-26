/**
 * One-time Marktplaats login for the 2beAcquired actor.
 *
 * Marktplaats login uses SMS 2FA + reCAPTCHA enterprise + device fingerprinting, so it is never
 * automated: this opens a real (headed) browser with a persistent profile, YOU log in, and the
 * script only watches for the session to become valid. Then it saves the Playwright storageState
 * to .mp-session/state.json and, when APIFY_TOKEN is set in the repo's .env, uploads it to the
 * named key-value store `mp-session` (key `state`), where the actor reads it.
 *
 *   npm --prefix scripts/mp-login install          # once
 *   npx tsx scripts/mp-login/index.ts              # log in (or reuse the profile) and upload
 *   npx tsx scripts/mp-login/index.ts --check      # is the saved session still valid?
 *   npx tsx scripts/mp-login/index.ts --upload-only  # re-upload .mp-session/state.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, type BrowserContext } from 'playwright';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SESSION_DIR = join(REPO_ROOT, '.mp-session');
const PROFILE_DIR = join(SESSION_DIR, 'profile');
const STATE_PATH = join(SESSION_DIR, 'state.json');
const BASE = 'https://www.marktplaats.nl';
const LOGIN_URL = `${BASE}/identity/v2/login?target=${encodeURIComponent('/messages')}`;
const STORE_NAME = 'mp-session';
const STORE_KEY = 'state';

const args = new Set(process.argv.slice(2));
const timeoutMinutes = Number(process.argv.find((a) => a.startsWith('--timeout='))?.split('=')[1] ?? 10);

if (existsSync(join(REPO_ROOT, '.env'))) process.loadEnvFile(join(REPO_ROOT, '.env'));
const APIFY_TOKEN = process.env.APIFY_TOKEN?.trim();

interface StorageState {
    cookies: { name: string; value: string; domain: string; [k: string]: unknown }[];
    origins: { origin: string; localStorage: unknown[] }[];
    meta?: Record<string, unknown>;
}

async function launch(): Promise<BrowserContext> {
    mkdirSync(PROFILE_DIR, { recursive: true });
    const options = {
        headless: false,
        viewport: null,
        locale: 'nl-NL',
        timezoneId: 'Europe/Amsterdam',
        args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
        ignoreDefaultArgs: ['--enable-automation'],
    };
    // A real installed browser first: captcha and SMS verification behave as usual there.
    for (const channel of ['chrome', 'msedge'] as const) {
        try {
            const context = await chromium.launchPersistentContext(PROFILE_DIR, { ...options, channel });
            console.log(`Opened ${channel} with profile ${PROFILE_DIR}`);
            return context;
        } catch {
            // not installed: try the next one
        }
    }
    try {
        return await chromium.launchPersistentContext(PROFILE_DIR, options);
    } catch (err) {
        console.error(`No browser available. Install Chrome, or run: npx playwright install chromium\n${(err as Error).message}`);
        process.exit(1);
    }
}

async function unreadCount(context: BrowserContext): Promise<number | null> {
    try {
        const res = await context.request.get(`${BASE}/header/messages/message-count`, {
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', Referer: `${BASE}/` },
            failOnStatusCode: false,
        });
        if (res.status() !== 200) return null;
        const data = await res.json();
        return typeof data?.unreadMessagesCount === 'number' ? data.unreadMessagesCount : 0;
    } catch {
        return null;
    }
}

/** Keep only Marktplaats cookies/storage: the actor needs nothing else, and nothing else should leave this machine. */
function onlyMarktplaats(state: StorageState): StorageState {
    return {
        cookies: state.cookies.filter((c) => c.domain.includes('marktplaats.nl')),
        origins: state.origins.filter((o) => o.origin.includes('marktplaats.nl')),
    };
}

async function upload(state: StorageState): Promise<void> {
    if (!APIFY_TOKEN) {
        console.log('APIFY_TOKEN is empty in .env: skipped the upload. Set it and run again with --upload-only.');
        return;
    }
    const headers = { Authorization: `Bearer ${APIFY_TOKEN}`, 'Content-Type': 'application/json' };
    // POST with ?name= returns the existing store of that name, or creates it.
    const storeRes = await fetch(`https://api.apify.com/v2/key-value-stores?name=${STORE_NAME}`, { method: 'POST', headers });
    if (!storeRes.ok) throw new Error(`Apify: could not open store '${STORE_NAME}' (HTTP ${storeRes.status}): ${await storeRes.text()}`);
    const storeId = (await storeRes.json()).data.id as string;
    const putRes = await fetch(`https://api.apify.com/v2/key-value-stores/${storeId}/records/${STORE_KEY}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(state),
    });
    if (!putRes.ok) throw new Error(`Apify: upload failed (HTTP ${putRes.status}): ${await putRes.text()}`);
    console.log(`Uploaded to Apify key-value store '${STORE_NAME}' (id ${storeId}), key '${STORE_KEY}'.`);
}

async function checkSaved(): Promise<void> {
    if (!existsSync(STATE_PATH)) {
        console.log(`No ${STATE_PATH} yet.`);
        process.exit(1);
    }
    const state = JSON.parse(readFileSync(STATE_PATH, 'utf8')) as StorageState;
    const cookie = state.cookies
        .filter((c) => c.domain.includes('marktplaats.nl'))
        .map((c) => `${c.name}=${c.value}`)
        .join('; ');
    const res = await fetch(`${BASE}/header/messages/message-count`, {
        headers: {
            Cookie: cookie,
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent': String(state.meta?.userAgent ?? 'Mozilla/5.0'),
        },
    });
    console.log(res.status === 200 ? `Session valid: ${await res.text()}` : `Session NOT valid (HTTP ${res.status}). Run the login again.`);
    process.exit(res.status === 200 ? 0 : 1);
}

async function main(): Promise<void> {
    if (args.has('--check')) return checkSaved();
    if (args.has('--upload-only')) {
        await upload(JSON.parse(readFileSync(STATE_PATH, 'utf8')));
        return;
    }

    const context = await launch();
    const page = context.pages()[0] ?? (await context.newPage());
    let unread = await unreadCount(context);
    if (unread === null) {
        await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
        console.log('\nLog in to Marktplaats in the browser window (SMS code, captcha: all by hand).');
        console.log(`Waiting up to ${timeoutMinutes} minutes for the session to become valid...`);
        const deadline = Date.now() + timeoutMinutes * 60_000;
        while (unread === null && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 2000));
            if (context.pages().length === 0) {
                console.error('The browser window was closed before logging in.');
                process.exit(1);
            }
            unread = await unreadCount(context);
        }
        if (unread === null) {
            console.error('Timed out waiting for a login.');
            await context.close();
            process.exit(1);
        }
    } else {
        console.log('Already logged in with the saved profile.');
    }
    console.log(`Logged in (${unread} unread messages).`);

    // Let the site set its post-login cookies (consent, device) on a couple of normal pages.
    await page.goto(`${BASE}/messages`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await page.waitForTimeout(3000);
    await page.goto(`${BASE}/my-account/sell/index.html`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await page.waitForTimeout(2000);
    const userAgent = await page.evaluate(() => navigator.userAgent);

    const state = onlyMarktplaats((await context.storageState()) as StorageState);
    state.meta = { userAgent, savedAt: new Date().toISOString(), source: 'scripts/mp-login' };
    await context.close();

    if (!state.cookies.some((c) => c.name === 'MpSession')) {
        console.warn("Warning: no 'MpSession' cookie in the saved state; the session cookie may have another name now.");
    }
    mkdirSync(SESSION_DIR, { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    console.log(`Saved ${state.cookies.length} cookies to ${STATE_PATH}`);
    await upload(state);
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
