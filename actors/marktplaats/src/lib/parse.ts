/** Pure parsing helpers (no I/O), shared by several actions. */

const CONFIG_RE = /window\.__CONFIG__\s*=\s*(\{.*?\});\s*<\/script>/s;

/** The listing page embeds its data as `window.__CONFIG__ = {...};` (listing.stats, bidsInfo, priceInfo, ...). */
export function extractListingConfig(html: string): Record<string, any> | null {
    const match = CONFIG_RE.exec(html);
    if (!match) return null;
    try {
        const config = JSON.parse(match[1]);
        return config && typeof config.listing === 'object' ? config.listing : null;
    } catch {
        return null;
    }
}

export const euros = (cents: unknown): number | null =>
    typeof cents === 'number' && Number.isFinite(cents) ? Math.round(cents) / 100 : null;

const MONTHS: Record<string, number> = {
    jan: 0, feb: 1, mrt: 2, mar: 2, apr: 3, mei: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dec: 11,
};

/** Search results carry relative Dutch labels ('Vandaag', 'Gisteren', '23 sep 26'); make them ISO dates. */
export function dutchDateToIso(label: unknown, now = new Date()): string | null {
    if (typeof label !== 'string') return null;
    const text = label.trim().toLowerCase();
    const shift = (days: number) => {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days));
        return d.toISOString().slice(0, 10);
    };
    if (text === 'vandaag') return shift(0);
    if (text === 'gisteren') return shift(1);
    if (text === 'eergisteren') return shift(2);
    const m = /^(\d{1,2})\s+([a-z]{3})\.?\s+'?(\d{2,4})$/.exec(text);
    if (m && MONTHS[m[2]] !== undefined) {
        const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
        return new Date(Date.UTC(year, MONTHS[m[2]], Number(m[1]))).toISOString().slice(0, 10);
    }
    return null;
}

export function absoluteUrl(path: unknown, base = 'https://www.marktplaats.nl'): string | null {
    if (typeof path !== 'string' || !path) return null;
    if (path.startsWith('//')) return `https:${path}`;
    if (path.startsWith('/')) return `${base}${path}`;
    return path;
}

export const asStr = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));
export const asInt = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
    if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
    return null;
};

export interface Bid {
    bidId: string | null;
    amount: number | null; // euros
    ts: string | null;
    bidder: { id: string | null; name: string | null };
}

/** listing.bidsInfo.bids -> [{bidId, amount, ts, bidder}], highest first. Shape verified on a live listing:
 *  {"id":1558673339,"value":500,"date":"2026-09-26T09:48:33Z","user":{"id":2615760,"nickname":"Anton"}} */
export function normalizeBids(bidsInfo: any): Bid[] {
    const raw: any[] = Array.isArray(bidsInfo?.bids) ? bidsInfo.bids : [];
    return raw
        .filter((b) => b && typeof b === 'object')
        .map((b) => ({
            bidId: asStr(b.id),
            amount: euros(b.value ?? b.amount ?? b.bidAmountCents ?? b.priceCents),
            ts: asStr(b.date),
            bidder: { id: asStr(b.user?.id), name: asStr(b.user?.nickname ?? b.user?.name) },
        }))
        .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
}
