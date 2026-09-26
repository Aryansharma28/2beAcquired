/**
 * update_price: open the ad's edit form from "Mijn advertenties", change the price, save.
 * UNVERIFIED flow (see README "needs a live check"); run with dryRun first and look at the screenshots
 * and the `update_price-NETWORK_LOG` record, which captures the site's own save request.
 */
import { CookieJar } from 'tough-cookie';

import { acceptCookies, first, firstByName, withBrowser } from '../lib/browser.js';
import { inputError, MpError } from '../lib/errors.js';
import { MpHttp } from '../lib/http.js';
import { clickRowAction, openMyAdRow } from '../lib/myAds.js';
import { DEFAULT_UA } from '../lib/session.js';
import { BASE_URL, normalizeListingId, type Input } from '../lib/types.js';
import { SEL } from './post.js';
import { fetchListingStats } from './stats.js';

const EDIT_ACTIONS = [/prijs (wijzigen|aanpassen)/i, /^wijzig/i, /bewerk/i, /aanpassen/i, /^edit/i];
const SAVE_BUTTONS = [/wijzigingen opslaan/i, /^opslaan/i, /bijwerken/i, /^plaats( je)? advertentie/i, /advertentie plaatsen/i, /^klaar$/i, /^bevestig/i];
const UPSELL_SKIP = [/nee,? bedankt/i, /doorgaan zonder/i, /overslaan/i, /niet nu/i];
// GUESSES, tried only when no edit action is found on the row.
const EDIT_URL_GUESSES = (id: string) => [`${BASE_URL}/plaats/edit/${id}`, `${BASE_URL}/plaats/${id}/edit`];

export interface UpdatePriceResult {
    ok: boolean;
    dryRun: boolean;
    listingId: string;
    price: number;
    previousPrice: number | null;
    verifiedPrice: number | null;
    screenshots: { step: string; url: string }[];
    notes: string[];
}

export async function updatePrice(input: Input): Promise<UpdatePriceResult> {
    const listingId = normalizeListingId(input.listingId ?? input.listingUrl);
    if (!listingId) throw inputError("update_price needs 'listingId'");
    if (input.price === undefined || input.price === null || input.price < 0) throw inputError("update_price needs 'price'");
    const price = input.price;
    const dryRun = input.dryRun ?? false;
    const notes: string[] = [];

    const publicHttp = new MpHttp(new CookieJar(), DEFAULT_UA);
    const before = await fetchListingStats(publicHttp, listingId).catch(() => null);
    if (before?.status === 'removed') throw new MpError('NOT_FOUND', `listing ${listingId} is not online`);

    const result = await withBrowser(input, 'update_price', { blockImages: true }, async (run) => {
        const { page, shot, guard, shots } = run;
        let priceField = null;
        try {
            const row = await openMyAdRow(run, listingId);
            notes.push(`clicked '${await clickRowAction(page, row, EDIT_ACTIONS)}'`);
            await page.waitForLoadState('domcontentloaded');
            priceField =
                (await first(page, SEL.price, { timeout: 15_000 })) ??
                (await first(page, ["[role='dialog'] input[name*='price' i]", "[role='dialog'] input[inputmode='decimal']", "[role='dialog'] input[type='number']"], { timeout: 2000 }));
        } catch (err) {
            if (err instanceof MpError && ['SESSION_EXPIRED', 'CAPTCHA'].includes(err.code)) throw err;
            notes.push(`row action failed: ${(err as Error).message}`);
        }
        for (const url of priceField ? [] : EDIT_URL_GUESSES(listingId)) {
            const response = await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => null);
            await page.waitForTimeout(1500);
            await guard(response);
            await acceptCookies(page);
            priceField = await first(page, SEL.price, { timeout: 8000 });
            notes.push(`tried ${url}: ${priceField ? 'edit form' : 'no price field'}`);
            if (priceField) break;
        }
        if (!priceField) {
            await shot('no-price-field');
            throw new MpError('UI_CHANGED', `could not open the edit form of ${listingId} (${notes.join('; ')})`);
        }
        await shot('edit-form');
        await priceField.fill(Number.isInteger(price) ? String(price) : price.toFixed(2).replace('.', ','));
        await priceField.blur();
        await shot('price-filled');

        const save = await firstByName(page, SAVE_BUTTONS, { timeout: 5000, roles: ['button'] });
        notes.push(`save button: ${save ? await save.innerText().catch(() => '?') : 'NOT FOUND'}`);
        if (dryRun) return { saved: false, shots };
        if (!save) throw new MpError('UI_CHANGED', 'no save button on the edit form');
        await save.click();
        await page.waitForTimeout(3000);
        const upsell = await firstByName(page, UPSELL_SKIP, { timeout: 4000 });
        if (upsell) {
            await shot('upsell');
            await upsell.click();
            await page.waitForTimeout(2000);
        }
        await guard();
        await shot('saved');
        return { saved: true, shots };
    });

    let verifiedPrice: number | null = null;
    if (result.saved) {
        await new Promise((r) => setTimeout(r, 4000));
        verifiedPrice = (await fetchListingStats(publicHttp, listingId).catch(() => null))?.price ?? null;
        if (verifiedPrice !== price) notes.push(`public page shows ${verifiedPrice ?? '?'} (may lag behind for a minute)`);
    }
    return {
        ok: dryRun ? true : result.saved,
        dryRun,
        listingId,
        price,
        previousPrice: before?.price ?? null,
        verifiedPrice,
        screenshots: result.shots.map((s) => ({ step: s.step, url: s.url })),
        notes,
    };
}
