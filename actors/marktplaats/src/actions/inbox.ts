/**
 * inbox: conversations + messages over HTTP with the stored session, plus the bids on the
 * user's own listings.
 *
 * Endpoints (same order and fallbacks as jasp-nerd/marktplaats-mcp account.py):
 *   unread     GET /header/messages/message-count                                  -> {unreadMessagesCount}
 *   list       GET /messages/api/rpc/conversations.getConversations?input={"json":{limit,offset}}   (tRPC, current)
 *              GET /messages/api/conversations/?offset=&limit=&excluded=mp:advertisement,_links      (HAL, legacy, on 404)
 *   thread     GET /messages/api/rpc/conversations.getMessagesForConversation?input={"json":{conversationId}}
 *              GET /messages/api/conversations/{id}/messages/?offset=0&limit=N&expand=actions,mc:messages:0:N
 *   my ads     GET /my-account/sell/api/listings?batchNumber=1&batchSize=50       -> {ads:[...]}
 *   bids       public listing page window.__CONFIG__.listing.bidsInfo.bids (shape verified on a live ad)
 */
import { log } from 'apify';

import { MpError } from '../lib/errors.js';
import { openHttpSession } from '../lib/httpSession.js';
import type { MpHttp } from '../lib/http.js';
import { trpcInput } from '../lib/http.js';
import { asInt, asStr, euros, type Bid } from '../lib/parse.js';
import { BASE_URL, type Input } from '../lib/types.js';
import { fetchListingStats } from './stats.js';

export interface InboxMessage {
    id: string | null;
    from: 'buyer' | 'me' | 'system';
    text: string;
    ts: string | null;
    type: string | null; // null for plain text; e.g. paymentOffer, p2pPaymentRequest
    offer: { amount: number | null; status: string | null } | null;
    isNew: boolean;
}

export interface InboxEntry {
    type: 'conversation' | 'bids_only';
    conversationId: string | null;
    listingId: string | null;
    listingTitle: string | null;
    listingUrl: string | null;
    role: 'seller' | 'buyer' | null; // my role in the conversation
    buyer: { id: string | null; name: string | null };
    unread: number;
    lastActivity: string | null;
    messages: InboxMessage[];
    bids: Bid[]; // all bids on the listing, highest first
    buyerBid: Bid | null; // this buyer's highest bid, if any
}

// --- pure normalisers (unit-tested) ---------------------------------------------------

export function conversationRows(data: any): any[] {
    const current = data?.result?.data;
    if (Array.isArray(current)) return current.filter((r) => r && typeof r === 'object');
    const legacy = data?._embedded?.['mc:conversations'];
    if (Array.isArray(legacy)) return legacy.filter((r) => r && typeof r === 'object');
    return [];
}

export function normalizeConversationRow(raw: any) {
    const other = raw.otherParticipant ?? {};
    const otherId = asStr(other.userId ?? other.id);
    const sellerId = asStr(raw.sellerId);
    const role: 'seller' | 'buyer' | null =
        sellerId && otherId ? (sellerId === otherId ? 'buyer' : 'seller') : null;
    const itemId = asStr(raw.itemId);
    return {
        conversationId: String(raw.conversationId ?? raw.id ?? ''),
        listingId: itemId,
        listingTitle: asStr(raw.title ?? raw.itemTitle),
        listingUrl: itemId ? `${BASE_URL}/${itemId}` : null,
        role,
        buyer: { id: otherId, name: asStr(other.name ?? other.displayName) },
        unread: asInt(raw.unreadMessagesCount ?? raw.unreadCount) ?? 0,
        lastActivity: asStr(raw.latestReceivedDate ?? raw.lastMessageAt ?? raw.latestMessage?.receivedDate),
    };
}

export function normalizeMessages(data: any, otherId: string | null, since: number | null): InboxMessage[] {
    const current = data?.result?.data;
    const embedded = data?._embedded ?? {};
    const raw: any[] =
        (current && typeof current === 'object' ? current.messages : embedded['mc:message'] ?? embedded['mc:messages']) ??
        [];
    // legacy HAL threads name the other party in _embedded; tRPC threads mark senders as 'me'/'otherParticipant'
    otherId = otherId ?? asStr(embedded.otherParticipant?.id ?? embedded.otherParticipant?.userId);
    const messages = raw
        .filter((m) => m && typeof m === 'object' && typeof m.text === 'string')
        .map((m): InboxMessage => {
            let from: InboxMessage['from'];
            if (m.from === 'me') from = 'me';
            else if (m.from === 'otherParticipant') from = 'buyer';
            else if (m.from === 'system' || m.messageType === 'systemMessage') from = 'system';
            else if (otherId && m.senderId !== undefined) from = String(m.senderId) === otherId ? 'buyer' : 'me';
            else from = 'system';
            const offer = m.attachment?.paymentOffer;
            const ts = asStr(m.receivedDate ?? m.sentDate ?? m.date);
            const type = asStr(m.type);
            return {
                id: asStr(m.messageId ?? m.id),
                from,
                text: m.text,
                ts,
                type: type && type !== 'text' ? type : null,
                offer: offer ? { amount: euros(offer.offerPrice), status: asStr(offer.status) } : null,
                isNew: since !== null && ts !== null ? Date.parse(ts) > since : since === null,
            };
        });
    return messages.sort((a, b) => (a.ts && b.ts ? Date.parse(a.ts) - Date.parse(b.ts) : 0));
}

// --- requests -------------------------------------------------------------------------

export async function listConversations(http: MpHttp, limit: number, offset = 0): Promise<any[]> {
    const referer = `${BASE_URL}/messages`;
    const res = await http.call(
        'GET',
        `/messages/api/rpc/conversations.getConversations?input=${trpcInput({ limit, offset })}`,
        { referer, passStatuses: [404] },
    );
    if (res.status !== 404) return conversationRows(res.json);
    const legacy = await http.getJson(
        `/messages/api/conversations/?offset=${offset}&limit=${limit}&excluded=mp:advertisement,_links`,
        { referer },
    );
    return conversationRows(legacy);
}

export async function getThread(http: MpHttp, conversationId: string, limit = 100): Promise<any> {
    const referer = `${BASE_URL}/messages/${conversationId}`;
    const res = await http.call(
        'GET',
        `/messages/api/rpc/conversations.getMessagesForConversation?input=${trpcInput({ conversationId })}`,
        { referer, passStatuses: [404] },
    );
    if (res.status !== 404) return res.json ?? {};
    return http.getJson(
        `/messages/api/conversations/${encodeURIComponent(conversationId)}/messages/?offset=0&limit=${limit}` +
            `&expand=actions,mc:messages:0:${limit}`,
        { referer },
    );
}

export async function unreadCount(http: MpHttp): Promise<number | null> {
    const data = await http.getJson<any>('/header/messages/message-count');
    for (const key of ['unreadMessagesCount', 'unreadMessageCount', 'messageCount']) {
        if (typeof data?.[key] === 'number') return data[key];
    }
    return null;
}

export async function myListings(http: MpHttp): Promise<any[]> {
    const data = await http.getJson<any>('/my-account/sell/api/listings?batchNumber=1&batchSize=50', {
        referer: `${BASE_URL}/my-account/sell/index.html`,
    });
    return Array.isArray(data?.ads) ? data.ads : [];
}

// --- action ---------------------------------------------------------------------------

export async function inbox(input: Input): Promise<InboxEntry[]> {
    const session = await openHttpSession(input, true);
    return session.use(async (http) => {
        const since = input.since ? Date.parse(input.since) : null;
        if (input.since && Number.isNaN(since)) throw new MpError('INPUT', `'since' is not an ISO date: ${input.since}`);

        const unread = await unreadCount(http); // cheap auth check: 401 -> SESSION_EXPIRED
        log.info(`Logged in; ${unread ?? '?'} unread messages.`);

        const rows = await listConversations(http, input.conversationLimit ?? 20);
        const sellingOnly = input.sellingOnly ?? true;
        const entries: InboxEntry[] = [];
        for (const raw of rows) {
            const conv = normalizeConversationRow(raw);
            if (!conv.conversationId) continue;
            if (sellingOnly && conv.role === 'buyer') continue;
            if (since !== null && conv.lastActivity && Date.parse(conv.lastActivity) <= since) continue;
            const thread = await getThread(http, conv.conversationId);
            const messages = normalizeMessages(thread, conv.buyer.id, since);
            if (since !== null && !conv.lastActivity && !messages.some((m) => m.isNew)) continue;
            entries.push({ type: 'conversation', ...conv, messages, bids: [], buyerBid: null });
        }

        if (input.includeBids ?? true) await attachBids(http, entries, since);
        log.info(`inbox: ${entries.length} entries`);
        return entries;
    });
}

/** Bids live on the listing, not in the chat. Read them for every own listing that can have bids. */
async function attachBids(http: MpHttp, entries: InboxEntry[], since: number | null): Promise<void> {
    const listings = new Map<string, { title: string | null }>();
    try {
        for (const ad of await myListings(http)) {
            const id = asStr(ad.itemId);
            const status = String(ad.status ?? 'ACTIVE').toUpperCase();
            if (!id || !['ACTIVE', 'ONLINE', 'PUBLISHED'].includes(status)) continue;
            const priceType = String(ad.priceInfo?.priceType ?? ad.priceType ?? '');
            const biddable = ad.biddingEnabled === true || ad.highestBid || /BID/.test(priceType);
            if (biddable || ad.biddingEnabled === undefined) listings.set(id, { title: asStr(ad.title) });
        }
    } catch (err) {
        if (err instanceof MpError && err.code === 'SESSION_EXPIRED') throw err;
        log.warning(`Could not read own listings (${(err as Error).message}); bids only for listings in conversations.`);
    }
    for (const e of entries) if (e.listingId && e.role !== 'buyer') listings.set(e.listingId, { title: e.listingTitle });

    for (const [listingId, meta] of listings) {
        let bids: Bid[];
        try {
            bids = (await fetchListingStats(http, listingId, false)).bids;
        } catch (err) {
            log.warning(`bids for ${listingId}: ${(err as Error).message}`);
            continue;
        }
        const withChat = entries.filter((e) => e.listingId === listingId);
        for (const e of withChat) {
            e.bids = bids;
            e.buyerBid = bids.find((b) => b.bidder.id && b.bidder.id === e.buyer.id) ?? null;
        }
        const chatBuyers = new Set(withChat.map((e) => e.buyer.id));
        const bidOnly = new Map<string, Bid>(); // highest bid per bidder without a conversation
        for (const bid of bids) {
            const key = bid.bidder.id ?? bid.bidId ?? '';
            if (chatBuyers.has(bid.bidder.id) || bidOnly.has(key)) continue;
            if (since !== null && bid.ts && Date.parse(bid.ts) <= since) continue;
            bidOnly.set(key, bid);
        }
        for (const bid of bidOnly.values()) {
            entries.push({
                type: 'bids_only',
                conversationId: null,
                listingId,
                listingTitle: meta.title,
                listingUrl: `${BASE_URL}/${listingId}`,
                role: 'seller',
                buyer: { id: bid.bidder.id, name: bid.bidder.name },
                unread: 0,
                lastActivity: bid.ts,
                messages: [],
                bids,
                buyerBid: bid,
            });
        }
    }
}
