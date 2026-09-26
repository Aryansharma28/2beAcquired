/**
 * stats: public listing page -> window.__CONFIG__.listing.stats {viewCount, favoritedCount, since}
 * plus price and bids. A removed listing (HTTP 404/410) returns status 'removed' instead of failing,
 * so W4/W5 can use this to verify a delist.
 */
import { CookieJar } from 'tough-cookie';

import { inputError, MpError } from '../lib/errors.js';
import { MpHttp } from '../lib/http.js';
import { euros, extractListingConfig, normalizeBids, type Bid } from '../lib/parse.js';
import { proxyUrlFor } from '../lib/proxy.js';
import { DEFAULT_UA } from '../lib/session.js';
import { BASE_URL, normalizeListingId, type Input } from '../lib/types.js';

export interface ListingStats {
    listingId: string | null;
    url: string;
    status: 'active' | 'removed';
    title: string | null;
    views: number | null;
    favorites: number | null;
    since: string | null;
    price: number | null;
    priceType: string | null;
    reserved: boolean;
    bids: Bid[];
    highestBid: number | null;
    category: string | null;
    checkedAt: string;
}

/** anonymous=false sends the session cookie (the owner looking at their own ad should not inflate its views). */
export async function fetchListingStats(http: MpHttp, urlOrId: string, anonymous = true): Promise<ListingStats> {
    const id = normalizeListingId(urlOrId);
    const url = urlOrId.startsWith('http') ? urlOrId : `${BASE_URL}/${id}`;
    const res = await http.getHtml(url, anonymous);
    const base = { listingId: id, url, checkedAt: new Date().toISOString() };
    if (res.status === 404 || res.status === 410) {
        return {
            ...base, status: 'removed', title: null, views: null, favorites: null, since: null, price: null,
            priceType: null, reserved: false, bids: [], highestBid: null, category: null,
        };
    }
    http.raiseFor(res, url);
    const listing = extractListingConfig(res.body);
    if (!listing) throw new MpError('UI_CHANGED', `no window.__CONFIG__ listing data on ${url}`);
    const bids = normalizeBids(listing.bidsInfo);
    return {
        ...base,
        listingId: listing.itemId ?? id,
        url: res.url || url,
        status: 'active',
        title: listing.title ?? null,
        views: listing.stats?.viewCount ?? null,
        favorites: listing.stats?.favoritedCount ?? null,
        since: listing.stats?.since ?? null,
        price: euros(listing.priceInfo?.priceCents) || null,
        priceType: listing.priceInfo?.priceType ?? null,
        reserved: Boolean(listing.isReserved),
        bids,
        highestBid: bids[0]?.amount ?? null,
        category: listing.category?.name ?? null,
    };
}

export async function stats(input: Input): Promise<ListingStats> {
    const target = input.listingUrl?.trim() || input.listingId?.trim();
    if (!target || !normalizeListingId(target)) throw inputError("stats needs 'listingUrl' or 'listingId'");
    const http = new MpHttp(new CookieJar(), DEFAULT_UA, await proxyUrlFor(input.useProxy));
    return fetchListingStats(http, target);
}
