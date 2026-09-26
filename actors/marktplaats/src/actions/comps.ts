/**
 * comps: comparable listings from the public search JSON (no login).
 * GET /lrp/api/search?query=..&limit=..&offset=..  (shape verified 2026-09-26)
 */
import { log } from 'apify';

import { inputError } from '../lib/errors.js';
import { MpHttp } from '../lib/http.js';
import { absoluteUrl, dutchDateToIso, euros } from '../lib/parse.js';
import { proxyUrlFor } from '../lib/proxy.js';
import { DEFAULT_UA } from '../lib/session.js';
import type { Input } from '../lib/types.js';
import { CookieJar } from 'tough-cookie';

export interface Comp {
    itemId: string;
    title: string;
    price: number | null; // euros; null when the ad has no amount (Bieden without start price, Zie omschrijving, ...)
    priceType: string; // FIXED | MIN_BID | FAST_BID | SEE_DESCRIPTION | NOTK | FREE | EXCHANGE | ...
    url: string;
    image: string | null;
    date: string | null; // label as shown ('Vandaag', '23 sep 26')
    dateIso: string | null;
    city: string | null;
    condition: string | null;
    delivery: string | null;
    categoryId: number | null;
    sellerId: number | null;
    reserved: boolean;
    promoted: boolean;
    platform: 'marktplaats';
}

const PAGE_SIZE = 100; // the API caps limit at 100 and aligns offset to a multiple of limit

export function mapListing(l: any): Comp {
    const cents = l?.priceInfo?.priceCents;
    const attr = (key: string) =>
        (l.attributes ?? l.extendedAttributes ?? []).find((a: any) => a?.key === key)?.value ?? null;
    const picture = Array.isArray(l.pictures) && l.pictures[0];
    return {
        itemId: String(l.itemId),
        title: String(l.title ?? ''),
        price: typeof cents === 'number' && cents > 0 ? euros(cents) : null,
        priceType: String(l?.priceInfo?.priceType ?? 'UNKNOWN'),
        url: absoluteUrl(l.vipUrl) ?? `https://www.marktplaats.nl/${l.itemId}`,
        image: (picture && (picture.largeUrl || picture.mediumUrl)) || absoluteUrl(l.imageUrls?.[0]) || null,
        date: l.date ?? null,
        dateIso: dutchDateToIso(l.date),
        city: l.location?.cityName ?? null,
        condition: attr('condition'),
        delivery: attr('delivery'),
        categoryId: typeof l.categoryId === 'number' ? l.categoryId : null,
        sellerId: l.sellerInformation?.sellerId ?? null,
        reserved: Boolean(l.reserved),
        promoted: Boolean(l.priorityProduct && l.priorityProduct !== 'NONE'),
        platform: 'marktplaats',
    };
}

export async function comps(input: Input): Promise<Comp[]> {
    const query = input.query?.trim();
    if (!query) throw inputError("comps needs 'query'");
    const wanted = Math.max(1, Math.min(input.limit ?? 30, 300));
    const http = new MpHttp(new CookieJar(), DEFAULT_UA, await proxyUrlFor(input.useProxy));

    const results: Comp[] = [];
    const seen = new Set<string>();
    let offset = 0;
    let total = Infinity;
    while (results.length < wanted && offset < total) {
        const params = new URLSearchParams({
            query,
            limit: String(PAGE_SIZE),
            offset: String(offset),
            searchInTitleAndDescription: 'true',
            viewOptions: 'list-view',
        });
        if (input.categoryId) params.set('l1CategoryId', String(input.categoryId));
        const data = await http.getJson<any>(`/lrp/api/search?${params}`, { anonymous: true });
        total = typeof data.totalResultCount === 'number' ? data.totalResultCount : 0;
        const listings: any[] = Array.isArray(data.listings) ? data.listings : [];
        if (!listings.length) break;
        for (const raw of listings) {
            if (!raw?.itemId || seen.has(raw.itemId)) continue;
            seen.add(raw.itemId);
            const comp = mapListing(raw);
            if (comp.price === null && !input.includeNoPrice) continue;
            // 'a...' ids are Admarkt ads from businesses / auction houses (new goods, EUR 1 starting bids): no comps.
            if ((input.excludeBusiness ?? true) && comp.itemId.startsWith('a')) continue;
            results.push(comp);
            if (results.length >= wanted) break;
        }
        offset += PAGE_SIZE;
    }
    log.info(`comps '${query}': ${results.length} listings (of ${Number.isFinite(total) ? total : '?'} matches)`);
    return results;
}
