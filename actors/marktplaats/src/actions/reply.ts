/**
 * reply: send a message in an existing conversation.
 *
 * http    POST /messages/api/conversations/{id}/message  body {"text": ...}
 *         headers: session cookie, Origin, Referer /messages/{id}, X-Requested-With,
 *         x-mp-xsrf (fresh from a page load) — identical to marktplaats-mcp send_message.
 * browser types into the chat box on /messages/{id} (opruimer's selector) and presses Enter.
 * auto    http first; falls back to browser only when the endpoint refused it (404 / other 4xx).
 */
import { log } from 'apify';

import { acceptCookies, first, withBrowser } from '../lib/browser.js';
import { inputError, MpError } from '../lib/errors.js';
import type { MpHttp } from '../lib/http.js';
import { openHttpSession } from '../lib/httpSession.js';
import { BASE_URL, type Input } from '../lib/types.js';

export interface ReplyResult {
    ok: boolean;
    conversationId: string;
    mode: 'http' | 'browser';
    text: string;
    sentAt: string;
    response?: unknown;
    screenshots?: string[];
}

export async function sendMessageHttp(http: MpHttp, conversationId: string, text: string) {
    return http.call('POST', `/messages/api/conversations/${encodeURIComponent(conversationId)}/message`, {
        json: { text },
        referer: `${BASE_URL}/messages/${conversationId}`,
        xsrf: true,
    });
}

async function replyHttp(input: Input, conversationId: string, text: string): Promise<ReplyResult> {
    const session = await openHttpSession(input, true);
    return session.use(async (http) => {
        const res = await sendMessageHttp(http, conversationId, text);
        const success = res.json && typeof res.json.success === 'boolean' ? res.json.success : true;
        if (!success) throw new MpError('FAILED', `site answered success=false: ${res.body.slice(0, 200)}`);
        return { ok: true, conversationId, mode: 'http' as const, text, sentAt: new Date().toISOString(), response: res.json };
    });
}

async function replyBrowser(input: Input, conversationId: string, text: string): Promise<ReplyResult> {
    return withBrowser(input, 'reply', { blockImages: true }, async ({ page, shot, guard, shots }) => {
        const response = await page.goto(`${BASE_URL}/messages/${conversationId}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);
        await guard(response);
        await acceptCookies(page);
        const box = await first(page, ["[contenteditable='true'][aria-label]", 'textarea[name*="message" i]', 'textarea'], {
            timeout: 15_000,
        });
        if (!box) {
            await shot('no-chat-box');
            throw new MpError('UI_CHANGED', 'chat input not found on the conversation page');
        }
        await box.click();
        const lines = text.split('\n');
        for (const [i, line] of lines.entries()) {
            if (i) await page.keyboard.press('Shift+Enter');
            await page.keyboard.insertText(line);
        }
        await shot('typed');
        await page.keyboard.press('Enter');
        const snippet = lines[0].slice(0, 40);
        await page
            .getByText(snippet, { exact: false })
            .last()
            .waitFor({ timeout: 10_000 })
            .catch(() => undefined);
        await page.waitForTimeout(1000);
        await shot('sent');
        return {
            ok: true,
            conversationId,
            mode: 'browser' as const,
            text,
            sentAt: new Date().toISOString(),
            screenshots: shots.map((s) => s.url),
        };
    });
}

export async function reply(input: Input): Promise<ReplyResult> {
    const conversationId = input.conversationId?.trim();
    const text = input.text?.trim();
    if (!conversationId) throw inputError("reply needs 'conversationId'");
    if (!text) throw inputError("reply needs 'text'");
    const mode = input.replyMode ?? 'auto';
    if (mode === 'browser') return replyBrowser(input, conversationId, text);
    try {
        return await replyHttp(input, conversationId, text);
    } catch (err) {
        // Only fall back when the endpoint clearly refused the request (404 / other 4xx); after a 5xx or
        // a network error the message may already be sent, and a second copy would reach the buyer.
        const code = err instanceof MpError ? err.code : 'FAILED';
        const refused = code === 'NOT_FOUND' || (code === 'FAILED' && /HTTP 4\d\d/.test((err as Error).message));
        if (mode === 'http' || !refused) throw err;
        log.warning(`HTTP reply failed (${(err as Error).message}); falling back to the browser.`);
        return replyBrowser(input, conversationId, text);
    }
}
