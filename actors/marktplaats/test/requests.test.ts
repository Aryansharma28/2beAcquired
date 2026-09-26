/**
 * Request-construction checks for inbox / reply against jasp-nerd/marktplaats-mcp
 * (src/marktplaats_mcp/account.py + tests/test_account.py): same URLs, headers, body, XSRF
 * handling and legacy fallbacks. Fixtures are the payload shapes from those tests
 * ("recorded from a real inbox on 2026-09-19"). No network: a fake transport answers.
 *
 * Run: npm test
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CookieJar } from 'tough-cookie';

import { getThread, listConversations, normalizeConversationRow, normalizeMessages, unreadCount } from '../src/actions/inbox.js';
import { sendMessageHttp } from '../src/actions/reply.js';
import { mapListing } from '../src/actions/comps.js';
import { MpError } from '../src/lib/errors.js';
import { MpHttp, type RawResponse, type RequestSpec, type Transport } from '../src/lib/http.js';
import { dutchDateToIso, extractListingConfig, normalizeBids } from '../src/lib/parse.js';
import { jarFromState, stateFromJar, type StorageState } from '../src/lib/session.js';

const BASE = 'https://www.marktplaats.nl';
const HOME_HTML = '<script>window.__HEADER_CONFIG__ = {"xsrfToken":"1789842030783.deadbeef"}</script>';
const STATE: StorageState = {
    cookies: [
        { name: 'MpSession', value: 'sess-123', domain: '.marktplaats.nl', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' },
        { name: 'other', value: 'x', domain: 'www.example.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' },
    ],
    origins: [],
    meta: { userAgent: 'UA-under-test' },
};

type Route = (spec: RequestSpec) => Partial<RawResponse> | undefined;

async function harness(route: Route) {
    const calls: (RequestSpec & { cookie: string })[] = [];
    const transport: Transport = async (spec, jar) => {
        calls.push({ ...spec, cookie: await jar.getCookieString(spec.url) });
        const res = route(spec) ?? { status: 404, body: 'not found' };
        return {
            status: res.status ?? 200,
            headers: res.headers ?? { 'content-type': 'application/json' },
            body: res.body ?? '{}',
            url: spec.url,
        };
    };
    const jar = await jarFromState(STATE);
    const http = new MpHttp(jar, 'UA-under-test', undefined, transport, 0);
    return { http, calls, jar };
}

const json = (value: unknown): Partial<RawResponse> => ({ status: 200, body: JSON.stringify(value) });
const html = (body: string): Partial<RawResponse> => ({ status: 200, body, headers: { 'content-type': 'text/html' } });

test('reply: fresh xsrf from a page load, then POST {text} with the mcp header set', async () => {
    const { http, calls } = await harness((spec) => {
        if (spec.method === 'GET' && spec.url === `${BASE}/`) return html(HOME_HTML);
        if (spec.method === 'POST' && spec.url === `${BASE}/messages/api/conversations/pj39%3A5871xhr%3A2psmwk4mr/message`)
            return json({ success: true });
        return undefined;
    });
    const res = await sendMessageHttp(http, 'pj39:5871xhr:2psmwk4mr', 'Hoi!');
    assert.equal(res.status, 200);
    assert.equal(calls.length, 2);
    const [home, post] = calls;
    assert.equal(home.url, `${BASE}/`);
    assert.match(home.cookie, /MpSession=sess-123/);
    assert.equal(post.method, 'POST');
    // quote(conversation_id, safe='') in account.py == encodeURIComponent
    assert.equal(post.url, `${BASE}/messages/api/conversations/pj39%3A5871xhr%3A2psmwk4mr/message`);
    assert.deepEqual(JSON.parse(post.body!), { text: 'Hoi!' });
    assert.equal(post.headers['x-mp-xsrf'], '1789842030783.deadbeef');
    assert.equal(post.headers.Origin, BASE);
    assert.equal(post.headers.Referer, `${BASE}/messages/pj39:5871xhr:2psmwk4mr`);
    assert.equal(post.headers['X-Requested-With'], 'XMLHttpRequest');
    assert.equal(post.headers.Accept, 'application/json, text/javascript, */*');
    assert.equal(post.headers['Content-Type'], 'application/json');
    assert.equal(post.headers['User-Agent'], 'UA-under-test');
    assert.equal(post.cookie, 'MpSession=sess-123'); // only marktplaats cookies go out
});

test('reply: xsrf is re-read before every write (rotates per page load)', async () => {
    const { http, calls } = await harness((spec) =>
        spec.method === 'GET' ? html(HOME_HTML) : json({ success: true }),
    );
    await sendMessageHttp(http, 'abc', 'een');
    await sendMessageHttp(http, 'abc', 'twee');
    assert.equal(calls.filter((c) => c.method === 'GET').length, 2);
});

test('reply: 401 -> SESSION_EXPIRED, POST is not retried', async () => {
    const { http, calls } = await harness((spec) =>
        spec.method === 'GET' ? html(HOME_HTML) : { status: 401, body: 'Unauthorized', headers: { 'content-type': 'text/plain' } },
    );
    await assert.rejects(sendMessageHttp(http, 'abc', 'hoi'), (err: unknown) => err instanceof MpError && err.code === 'SESSION_EXPIRED');
    assert.equal(calls.filter((c) => c.method === 'POST').length, 1);
});

test('reply: 503 on POST is not retried (the message may have been sent)', async () => {
    const { http, calls } = await harness((spec) => (spec.method === 'GET' ? html(HOME_HTML) : { status: 503, body: 'x' }));
    await assert.rejects(sendMessageHttp(http, 'abc', 'hoi'));
    assert.equal(calls.filter((c) => c.method === 'POST').length, 1);
});

test('reads: no xsrf header; unread count from /header/messages/message-count', async () => {
    const { http, calls } = await harness((spec) =>
        spec.url === `${BASE}/header/messages/message-count` ? json({ unreadMessagesCount: 3 }) : undefined,
    );
    assert.equal(await unreadCount(http), 3);
    assert.equal(calls[0].headers['x-mp-xsrf'], undefined);
    assert.equal(calls[0].headers['X-Requested-With'], 'XMLHttpRequest');
    assert.match(calls[0].cookie, /MpSession=sess-123/);
});

test('inbox: tRPC conversations with {"json":{limit,offset}} input', async () => {
    const live = {
        title: 'Boek',
        unreadMessagesCount: 1,
        itemId: 'm1',
        otherParticipant: { id: 14545042, name: 'Watson', userId: 14545042 },
        sellerId: 46236448,
        latestMessage: { senderId: -1, text: 'Geef vandaag je pakket af', receivedDate: '2026-09-19T19:00:09.801Z', from: 'system' },
        conversationId: 'pj39:5871xhr:2psmwk4mr',
        latestReceivedDate: '2026-09-19T19:00:09.801Z',
    };
    const { http, calls } = await harness((spec) =>
        spec.url.includes('conversations.getConversations') ? json({ result: { data: [live] } }) : undefined,
    );
    const rows = await listConversations(http, 20, 0);
    const url = new URL(calls[0].url);
    assert.equal(url.pathname, '/messages/api/rpc/conversations.getConversations');
    assert.deepEqual(JSON.parse(url.searchParams.get('input')!), { json: { limit: 20, offset: 0 } });
    assert.equal(calls[0].headers.Referer, `${BASE}/messages`);
    const conv = normalizeConversationRow(rows[0]);
    assert.equal(conv.conversationId, 'pj39:5871xhr:2psmwk4mr');
    assert.equal(conv.role, 'seller'); // other party is not the seller, so I am
    assert.deepEqual(conv.buyer, { id: '14545042', name: 'Watson' });
    assert.equal(conv.unread, 1);
    assert.equal(conv.listingId, 'm1');
    assert.equal(conv.lastActivity, '2026-09-19T19:00:09.801Z');
});

test('inbox: 404 on tRPC falls back to the legacy HAL endpoint', async () => {
    const { http, calls } = await harness((spec) => {
        if (spec.url.includes('/messages/api/conversations/?'))
            return json({
                _embedded: {
                    'mc:conversations': [
                        { id: '14s06:4cd8wk3:2kl3h37b0', title: 'Racefiets', unreadMessagesCount: 1, itemId: 'm123', otherParticipant: { id: 77, name: 'Piet' } },
                    ],
                },
            });
        return undefined; // tRPC -> 404
    });
    const rows = await listConversations(http, 20, 0);
    assert.equal(calls[1].url, `${BASE}/messages/api/conversations/?offset=0&limit=20&excluded=mp:advertisement,_links`);
    const conv = normalizeConversationRow(rows[0]);
    assert.equal(conv.conversationId, '14s06:4cd8wk3:2kl3h37b0');
    assert.deepEqual(conv.buyer, { id: '77', name: 'Piet' });
});

test('inbox: 401 on tRPC is SESSION_EXPIRED, never a legacy fallback', async () => {
    const { http, calls } = await harness(() => ({ status: 401, body: 'Unauthorized', headers: { 'content-type': 'text/plain' } }));
    await assert.rejects(getThread(http, 'abc'), (err: unknown) => err instanceof MpError && err.code === 'SESSION_EXPIRED');
    assert.equal(calls.length, 1);
});

test('thread: tRPC shape with a payment offer; senders mapped to buyer/me/system', async () => {
    const payload = {
        result: {
            data: {
                messages: [
                    {
                        messageId: '1', text: '[Betaling]', receivedDate: '2026-09-19T18:20:16.776Z', from: 'otherParticipant', type: 'paymentOffer',
                        attachment: { type: 'paymentOffer', paymentOffer: { status: 'ACCEPTED', offerPrice: 19000 } },
                    },
                    { messageId: '2', text: 'Ok!', from: 'me', type: 'text', receivedDate: '2026-09-19T18:25:00Z' },
                    { messageId: '3', text: 'Pakket verstuurd', from: 'system', type: 'text', receivedDate: '2026-09-19T19:00:00Z' },
                ],
            },
        },
    };
    const { http, calls } = await harness((spec) => (spec.url.includes('getMessagesForConversation') ? json(payload) : undefined));
    const data = await getThread(http, 'x:y');
    const url = new URL(calls[0].url);
    assert.deepEqual(JSON.parse(url.searchParams.get('input')!), { json: { conversationId: 'x:y' } });
    assert.equal(calls[0].headers.Referer, `${BASE}/messages/x:y`);
    const messages = normalizeMessages(data, null, Date.parse('2026-09-19T18:22:00Z'));
    assert.deepEqual(messages.map((m) => m.from), ['buyer', 'me', 'system']);
    assert.deepEqual(messages[0].offer, { amount: 190, status: 'ACCEPTED' });
    assert.equal(messages[0].type, 'paymentOffer');
    assert.equal(messages[1].type, null);
    assert.deepEqual(messages.map((m) => m.isNew), [false, true, true]);
});

test('thread: legacy HAL fallback URL and senderId-based senders', async () => {
    const legacy = {
        totalCount: 2,
        _embedded: {
            otherParticipant: { id: 77, name: 'Piet' },
            'mc:message': [
                { senderId: 77, receivedDate: '2026-09-19T09:00:00Z', text: 'Hoi' },
                { senderId: 1, receivedDate: '2026-09-19T09:05:00Z', text: 'Hallo!' },
            ],
        },
    };
    const { http, calls } = await harness((spec) => (spec.url.includes('/messages/api/conversations/abc/messages/') ? json(legacy) : undefined));
    const data = await getThread(http, 'abc', 150);
    assert.equal(calls[1].url, `${BASE}/messages/api/conversations/abc/messages/?offset=0&limit=150&expand=actions,mc:messages:0:150`);
    assert.deepEqual(normalizeMessages(data, null, null).map((m) => [m.from, m.text]), [
        ['buyer', 'Hoi'],
        ['me', 'Hallo!'],
    ]);
});

test('session: storageState <-> cookie jar round trip keeps the login cookie', async () => {
    const jar = await jarFromState(STATE);
    assert.equal(await jar.getCookieString(`${BASE}/messages`), 'MpSession=sess-123');
    const back = await stateFromJar(jar, STATE);
    const mp = back.cookies.find((c) => c.name === 'MpSession')!;
    assert.equal(mp.domain, '.marktplaats.nl');
    assert.equal(mp.secure, true);
    assert.equal(mp.httpOnly, true);
    assert.equal(back.meta?.userAgent, 'UA-under-test');
    assert.ok(new CookieJar());
});

test('parsing: bids, listing config, dates, search mapping', () => {
    const page = `<script>window.__CONFIG__ = {"listing":{"itemId":"m1","stats":{"favoritedCount":1,"viewCount":13,"since":"2026-09-26T08:19:25Z"},"bidsInfo":{"isBiddingEnabled":true,"bids":[{"id":1558673339,"value":500,"date":"2026-09-26T09:48:33Z","user":{"id":2615760,"nickname":"Anton"}},{"id":2,"value":900,"date":"2026-09-26T10:00:00Z","user":{"id":5,"nickname":"B"}}]}}};</script>`;
    const listing = extractListingConfig(page)!;
    assert.equal(listing.stats.viewCount, 13);
    const bids = normalizeBids(listing.bidsInfo);
    assert.deepEqual(bids.map((b) => b.amount), [9, 5]);
    assert.deepEqual(bids[1].bidder, { id: '2615760', name: 'Anton' });
    const now = new Date('2026-09-26T12:00:00Z');
    assert.equal(dutchDateToIso('Vandaag', now), '2026-09-26');
    assert.equal(dutchDateToIso('Eergisteren', now), '2026-09-24');
    assert.equal(dutchDateToIso('23 sep 26', now), '2026-09-23');
    const comp = mapListing({
        itemId: 'm2446876735', title: 'Fauteuil (Ikea Poang)', priceInfo: { priceCents: 3000, priceType: 'FIXED' },
        vipUrl: '/v/huis-en-inrichting/fauteuils/m2446876735-fauteuil-ikea-poang', date: 'Vandaag',
        attributes: [{ key: 'condition', value: 'Zo goed als nieuw' }], pictures: [{ largeUrl: 'https://img/x.jpg' }],
    });
    assert.equal(comp.price, 30);
    assert.equal(comp.url, `${BASE}/v/huis-en-inrichting/fauteuils/m2446876735-fauteuil-ikea-poang`);
    assert.equal(comp.condition, 'Zo goed als nieuw');
});
