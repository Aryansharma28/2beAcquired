/**
 * Plain-HTTP client for Marktplaats' own front-end endpoints (no browser).
 *
 * Header set and XSRF handling mirror jasp-nerd/marktplaats-mcp (account.py `_authed` /
 * `_fresh_xsrf`, client.py `BASE_HEADERS`): browser-like headers, the session cookie,
 * Origin/Referer/X-Requested-With, and for writes an `x-mp-xsrf` token scraped from a
 * fresh page load (`"xsrfToken":"..."`), because it rotates on every page load.
 */
import { gotScraping } from 'got-scraping';
import type { CookieJar } from 'tough-cookie';

import { MpError } from './errors.js';
import { BASE_URL } from './types.js';

export interface RequestSpec {
    method: 'GET' | 'POST';
    url: string;
    headers: Record<string, string>;
    body?: string;
}

export interface RawResponse {
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body: string;
    url: string;
}

/** Swappable for tests: the default one is got-scraping (browser-like TLS) with the cookie jar. */
export type Transport = (spec: RequestSpec, jar: CookieJar, proxyUrl?: string) => Promise<RawResponse>;

export const gotTransport: Transport = async (spec, jar, proxyUrl) => {
    const res = await gotScraping({
        url: spec.url,
        method: spec.method,
        headers: spec.headers,
        body: spec.body,
        cookieJar: jar,
        proxyUrl,
        useHeaderGenerator: false,
        throwHttpErrors: false,
        followRedirect: true,
        timeout: { request: 30_000 },
        retry: { limit: 0 },
    });
    return { status: res.statusCode, headers: res.headers, body: String(res.body ?? ''), url: res.url };
};

export const XSRF_RE = /"xsrfToken"\s*:\s*"([^"]+)"/;
const CAPTCHA_RE = /captcha-delivery|recaptcha\/(?:api2|enterprise)\/bframe|hcaptcha|unusual traffic|ben je een robot|are you a robot/i;
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

export interface CallOptions {
    json?: unknown;
    referer?: string;
    xsrf?: boolean;
    accept?: string;
    /** Statuses returned to the caller instead of thrown (e.g. 404 to trigger a fallback). */
    passStatuses?: number[];
    /** Requests that must not carry the user's session (public pages). */
    anonymous?: boolean;
}

export class MpHttp {
    private nextSlot = 0;

    constructor(
        readonly jar: CookieJar,
        readonly userAgent: string,
        readonly proxyUrl?: string,
        readonly transport: Transport = gotTransport,
        readonly minIntervalMs = 250,
    ) {}

    baseHeaders(): Record<string, string> {
        return {
            'User-Agent': this.userAgent,
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
        };
    }

    /** Build the request exactly as it goes on the wire (exported for the request-construction test). */
    async buildSpec(method: 'GET' | 'POST', pathOrUrl: string, opts: CallOptions = {}): Promise<RequestSpec> {
        const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${BASE_URL}${pathOrUrl}`;
        const headers: Record<string, string> = {
            ...this.baseHeaders(),
            Accept: opts.accept ?? 'application/json, text/javascript, */*',
            Origin: BASE_URL,
            Referer: opts.referer ?? `${BASE_URL}/`,
            'X-Requested-With': 'XMLHttpRequest',
        };
        if (opts.xsrf) headers['x-mp-xsrf'] = await this.freshXsrf();
        let body: string | undefined;
        if (opts.json !== undefined) {
            body = JSON.stringify(opts.json);
            headers['Content-Type'] = 'application/json';
        }
        return { method, url, headers, body };
    }

    /** The XSRF token rotates on every page load, so read it right before each write. */
    async freshXsrf(): Promise<string> {
        const res = await this.send({
            method: 'GET',
            url: `${BASE_URL}/`,
            headers: { ...this.baseHeaders(), Accept: 'text/html,application/xhtml+xml', 'Sec-Fetch-Mode': 'navigate' },
        });
        this.raiseFor(res, `${BASE_URL}/`);
        const match = XSRF_RE.exec(res.body);
        if (!match) throw new MpError('SESSION_EXPIRED', 'no xsrfToken on the home page; the session is not usable');
        return match[1];
    }

    async call(method: 'GET' | 'POST', pathOrUrl: string, opts: CallOptions = {}): Promise<RawResponse & { json?: any }> {
        const spec = await this.buildSpec(method, pathOrUrl, opts);
        const res = await this.send(spec, opts.anonymous);
        if (opts.passStatuses?.includes(res.status)) return res;
        this.raiseFor(res, spec.url);
        let json: unknown;
        const type = String(res.headers['content-type'] ?? '');
        if (type.includes('json')) {
            try {
                json = JSON.parse(res.body);
            } catch {
                throw new MpError('FAILED', `invalid JSON from ${spec.url}`);
            }
        }
        return { ...res, json };
    }

    async getJson<T = any>(path: string, opts: CallOptions = {}): Promise<T> {
        const res = await this.call('GET', path, opts);
        if (res.json === undefined) throw new MpError('FAILED', `expected JSON from ${path} (HTTP ${res.status})`);
        return res.json as T;
    }

    async getHtml(url: string, anonymous = false): Promise<RawResponse> {
        const spec: RequestSpec = {
            method: 'GET',
            url,
            headers: {
                ...this.baseHeaders(),
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
            },
        };
        return this.send(spec, anonymous);
    }

    /** Session-carrying requests go through the jar; anonymous ones get a throwaway jar. */
    private async send(spec: RequestSpec, anonymous = false): Promise<RawResponse> {
        let lastStatus = 0;
        for (let attempt = 0; attempt < 4; attempt++) {
            await this.waitForSlot();
            const jar = anonymous ? await freshJar() : this.jar;
            const res = await this.transport(spec, jar, this.proxyUrl);
            // Never repeat a write after a 5xx: it may have gone through.
            if (!RETRY_STATUSES.has(res.status) || (spec.method === 'POST' && res.status !== 429)) return res;
            lastStatus = res.status;
            const retryAfter = Number(res.headers['retry-after']);
            const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
            await sleep(Math.min(delay, 20_000) + Math.random() * 500);
        }
        if (lastStatus === 429) throw new MpError('BLOCKED', `HTTP 429 from ${spec.url} after retries`);
        throw new MpError('FAILED', `HTTP ${lastStatus} from ${spec.url} after retries`);
    }

    raiseFor(res: RawResponse, url: string): void {
        if (CAPTCHA_RE.test(res.body.slice(0, 20_000)) && (res.status >= 400 || !res.body.includes('xsrfToken'))) {
            throw new MpError('CAPTCHA', `bot wall / captcha on ${url} (HTTP ${res.status})`);
        }
        if (res.status === 401 || res.status === 403) {
            throw new MpError('SESSION_EXPIRED', `HTTP ${res.status} from ${url}; log in again with scripts/mp-login`);
        }
        if (/\/identity\/|\/account\/login/.test(res.url) && !url.includes('/identity/')) {
            throw new MpError('SESSION_EXPIRED', `redirected to the login page (${res.url})`);
        }
        if (res.status === 404) throw new MpError('NOT_FOUND', `HTTP 404 for ${url}`);
        if (res.status >= 400) throw new MpError('FAILED', `HTTP ${res.status} for ${url}: ${res.body.slice(0, 200)}`);
    }

    private async waitForSlot(): Promise<void> {
        const now = Date.now();
        if (now < this.nextSlot) await sleep(this.nextSlot - now);
        this.nextSlot = Math.max(now, this.nextSlot) + this.minIntervalMs;
    }
}

async function freshJar(): Promise<CookieJar> {
    const { CookieJar: Jar } = await import('tough-cookie');
    return new Jar();
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Encode a tRPC GET input the way the Marktplaats front-end does: ?input=<urlencoded {"json": ...}>. */
export function trpcInput(value: unknown): string {
    return encodeURIComponent(JSON.stringify({ json: value }));
}
