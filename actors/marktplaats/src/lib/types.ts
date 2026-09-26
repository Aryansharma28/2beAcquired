export type Action = 'comps' | 'inbox' | 'reply' | 'stats' | 'post' | 'update_price' | 'delist';

export interface Input {
    action: Action;
    // comps
    query?: string;
    limit?: number;
    categoryId?: number;
    includeNoPrice?: boolean;
    excludeBusiness?: boolean;
    // inbox / reply
    since?: string;
    conversationLimit?: number;
    includeBids?: boolean;
    sellingOnly?: boolean;
    conversationId?: string;
    text?: string;
    replyMode?: 'auto' | 'http' | 'browser';
    // stats / update_price / delist
    listingUrl?: string;
    listingId?: string;
    delistReason?: 'sold_on_marktplaats' | 'sold_elsewhere' | 'not_sold';
    // post
    title?: string;
    description?: string;
    price?: number;
    priceType?: string;
    allowBids?: boolean;
    minBid?: number;
    categoryHint?: string;
    photoUrls?: string[];
    condition?: string;
    delivery?: 'pickup' | 'shipping' | 'both';
    postcode?: string;
    attributes?: Record<string, string>;
    dryRun?: boolean;
    // advanced
    useProxy?: boolean;
    sessionStore?: string;
    photoStore?: string;
    headful?: boolean;
}

export const BASE_URL = 'https://www.marktplaats.nl';

/** 'm2446876735', '2446876735' or a listing URL -> 'm2446876735'. */
export function normalizeListingId(value: string | undefined): string | null {
    if (!value) return null;
    const match = /(?:^|[^\d])([am]?)(\d{7,})/i.exec(value.trim());
    if (!match) return null;
    return `${(match[1] || 'm').toLowerCase()}${match[2]}`;
}
