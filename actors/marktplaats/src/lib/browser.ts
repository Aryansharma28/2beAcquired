/**
 * Playwright plumbing for the browser actions (post, update_price, delist, reply fallback):
 * stored session, NL locale/timezone, optional residential proxy, resource blocking,
 * a screenshot per step into the default KV store, a log of the site's own XHR writes
 * (to learn endpoints), and login-wall / captcha detection.
 */
import { Actor, log } from 'apify';
import { chromium, type Browser, type BrowserContext, type Locator, type Page, type Response } from 'playwright';

import { MpError } from './errors.js';
import { proxyUrlFor } from './proxy.js';
import { loadSession, playwrightState, saveSession, type StorageState } from './session.js';
import type { Input } from './types.js';

export interface Shot {
    key: string;
    step: string;
    url: string;
}

export interface BrowserRun {
    page: Page;
    context: BrowserContext;
    shot: (step: string) => Promise<void>;
    guard: (response?: Response | null) => Promise<void>;
    shots: Shot[];
    network: { method: string; url: string; status?: number; body?: string }[];
}

const LOGIN_URL_RE = /\/identity\/|\/account\/login|\/login\.html/;
const BLOCK_TITLE_RE = /captcha|robot|access denied|geblokkeerd|unusual traffic|just a moment/i;

function parseProxy(url: string | undefined) {
    if (!url) return undefined;
    const u = new URL(url);
    return {
        server: `${u.protocol}//${u.hostname}:${u.port}`,
        username: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
    };
}

async function launch(input: Input): Promise<Browser> {
    const options = {
        headless: !input.headful,
        proxy: parseProxy(await proxyUrlFor(input.useProxy)),
        args: ['--disable-blink-features=AutomationControlled', '--lang=nl-NL', '--disable-dev-shm-usage'],
        ignoreDefaultArgs: ['--enable-automation'],
    };
    try {
        return await chromium.launch({ ...options, channel: 'chrome' }); // real Chrome (present in the Apify image)
    } catch {
        return chromium.launch(options); // bundled Chromium
    }
}

function userAgentFor(version: string): string {
    const major = version.split('.')[0];
    const platform =
        process.platform === 'win32'
            ? 'Windows NT 10.0; Win64; x64'
            : process.platform === 'darwin'
              ? 'Macintosh; Intel Mac OS X 10_15_7'
              : 'X11; Linux x86_64';
    return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

/**
 * Run `fn` with a logged-in page. Always: screenshot on error, write the (refreshed) session
 * back, save the network log, close the browser.
 */
export async function withBrowser<T>(
    input: Input,
    action: string,
    opts: { blockImages: boolean },
    fn: (run: BrowserRun) => Promise<T>,
): Promise<T> {
    const storeName = input.sessionStore || 'mp-session';
    const state = await loadSession(storeName);
    if (!state) {
        throw new MpError('SESSION_EXPIRED', `no stored session in KV store '${storeName}'; run scripts/mp-login first`);
    }

    const browser = await launch(input);
    const context = await browser.newContext({
        storageState: playwrightState(state),
        locale: 'nl-NL',
        timezoneId: 'Europe/Amsterdam',
        viewport: { width: 1366, height: 900 },
        userAgent: userAgentFor(browser.version()),
        extraHTTPHeaders: { 'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8' },
    });
    await context.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (type === 'font' || type === 'media' || (opts.blockImages && type === 'image')) return route.abort();
        return route.continue();
    });

    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    const kv = await Actor.openKeyValueStore();
    const shots: Shot[] = [];
    const network: BrowserRun['network'] = [];
    page.on('response', (res) => {
        const req = res.request();
        if (!['xhr', 'fetch'].includes(req.resourceType()) || req.method() === 'GET') return;
        if (!/marktplaats\.nl/.test(req.url())) return;
        network.push({ method: req.method(), url: req.url(), status: res.status(), body: req.postData()?.slice(0, 500) });
    });

    const shot = async (step: string) => {
        const slug = step.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
        const key = `${action}-${String(shots.length + 1).padStart(2, '0')}-${slug}`;
        try {
            const buffer = await page.screenshot({ type: 'jpeg', quality: 60, fullPage: true, timeout: 15_000 });
            await kv.setValue(key, buffer, { contentType: 'image/jpeg' });
            shots.push({ key, step, url: kv.getPublicUrl(key) });
            log.info(`screenshot ${key} (${page.url()})`);
        } catch (err) {
            log.warning(`screenshot '${step}' failed: ${(err as Error).message}`);
        }
    };

    const guard = async (response?: Response | null) => {
        await detectWalls(page, response ?? null, shot);
    };

    let rejected = false;
    try {
        return await fn({ page, context, shot, guard, shots, network });
    } catch (err) {
        rejected = err instanceof MpError && ['SESSION_EXPIRED', 'CAPTCHA'].includes(err.code);
        await shot(`error`);
        throw err;
    } finally {
        try {
            const fresh = (await context.storageState()) as StorageState;
            // Never overwrite a possibly still good login with the cookies of a rejected session.
            if (!rejected) {
                await saveSession(storeName, { ...fresh, meta: state.meta });
            }
        } catch (err) {
            log.warning(`could not save session: ${(err as Error).message}`);
        }
        await kv.setValue(`${action}-NETWORK_LOG`, network);
        await kv.setValue(`${action}-SCREENSHOTS`, shots);
        await browser.close().catch(() => undefined);
    }
}

export async function detectWalls(page: Page, response: Response | null, shot?: (s: string) => Promise<void>) {
    const url = page.url();
    if (LOGIN_URL_RE.test(url)) {
        await shot?.('login-wall');
        throw new MpError('SESSION_EXPIRED', `redirected to the login page (${url}); run scripts/mp-login again`);
    }
    const status = response?.status();
    const bodyText = await page
        .locator('body')
        .innerText({ timeout: 3000 })
        .catch(() => '');
    if (status === 401 || /^\s*unauthori[sz]ed\s*$/i.test(bodyText)) {
        await shot?.('unauthorized');
        throw new MpError('SESSION_EXPIRED', `HTTP ${status ?? '401'} on ${url}; run scripts/mp-login again`);
    }
    const title = await page.title().catch(() => '');
    const challenge = page.locator(
        "iframe[src*='recaptcha'][src*='bframe'], iframe[src*='captcha-delivery'], iframe[src*='hcaptcha'], iframe[title*='challenge' i]",
    );
    const visibleChallenge = await challenge
        .first()
        .isVisible()
        .catch(() => false);
    if (visibleChallenge || BLOCK_TITLE_RE.test(title) || status === 403) {
        await shot?.('captcha');
        throw new MpError('CAPTCHA', `captcha or bot wall on ${url} (title '${title}', HTTP ${status ?? '?'})`);
    }
}

// --- small locator helpers ---------------------------------------------------------------

/** First candidate that becomes visible (or attached) within `timeout`, else null. */
export async function first(
    scope: Page | Locator,
    candidates: string[],
    { timeout = 4000, state = 'visible' as 'visible' | 'attached' } = {},
): Promise<Locator | null> {
    const deadline = Date.now() + timeout;
    for (;;) {
        for (const selector of candidates) {
            const loc = scope.locator(selector).first();
            try {
                if (state === 'attached' ? (await loc.count()) > 0 : await loc.isVisible()) return loc;
            } catch {
                // invalid selector for this engine or detached: try the next one
            }
        }
        if (Date.now() > deadline) return null;
        await new Promise((r) => setTimeout(r, 200));
    }
}

/** First visible button/link whose accessible name matches one of the patterns. */
export async function firstByName(
    scope: Page | Locator,
    patterns: RegExp[],
    { timeout = 4000, roles = ['button', 'link'] as ('button' | 'link' | 'menuitem' | 'radio')[] } = {},
): Promise<Locator | null> {
    const deadline = Date.now() + timeout;
    for (;;) {
        for (const pattern of patterns) {
            for (const role of roles) {
                const loc = scope.getByRole(role, { name: pattern }).first();
                if (await loc.isVisible().catch(() => false)) return loc;
            }
        }
        if (Date.now() > deadline) return null;
        await new Promise((r) => setTimeout(r, 200));
    }
}

/** Accept the consent banner if it shows (our own account; consent is normally already stored in the session). */
export async function acceptCookies(page: Page): Promise<boolean> {
    const button = await first(page, ['#gdpr-consent-banner-accept-button', "button:has-text('Accepteren')"], {
        timeout: 2500,
    });
    if (button) {
        await button.click().catch(() => undefined);
        return true;
    }
    for (const frame of page.frames()) {
        const inFrame = frame.locator("button:has-text('Accepteren'), button[title='Accepteren']").first();
        if (await inFrame.isVisible().catch(() => false)) {
            await inFrame.click().catch(() => undefined);
            return true;
        }
    }
    return false;
}
