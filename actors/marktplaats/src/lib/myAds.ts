/**
 * Shared browser steps for actions on one of the user's own ads (update_price, delist):
 * open "Mijn advertenties", find the row of the ad, open one of its actions.
 * All of this is UNVERIFIED against the live page (no public reference implementation);
 * matching is by link href + accessible names so small markup changes do not break it.
 */
import type { Locator, Page } from 'playwright';

import { acceptCookies, firstByName, type BrowserRun } from './browser.js';
import { MpError } from './errors.js';
import { BASE_URL } from './types.js';

export const MY_ADS_URL = `${BASE_URL}/my-account/sell/index.html`;
const MORE_MENU = [/^meer/i, /opties/i, /acties/i, /more/i, /^\.\.\.$/, /⋮|…/];

export async function openMyAdRow(run: BrowserRun, listingId: string): Promise<Locator> {
    const { page, guard, shot } = run;
    const response = await page.goto(MY_ADS_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await guard(response);
    await acceptCookies(page);
    const digits = listingId.replace(/^[am]/i, '');
    const link = page.locator(`a[href*='${digits}']`).first();
    try {
        await link.waitFor({ state: 'attached', timeout: 20_000 });
    } catch {
        await shot('my-ads-no-row');
        throw new MpError('NOT_FOUND', `listing ${listingId} not found on ${MY_ADS_URL} (first page)`);
    }
    await link.scrollIntoViewIfNeeded().catch(() => undefined);
    // Nearest ancestor of the ad link that also holds the row's buttons.
    const row = link.locator('xpath=ancestor::*[.//button][1]');
    await shot('my-ads-row');
    return row;
}

/** Click the row action whose name matches, looking inside a "more" menu when it is not directly visible. */
export async function clickRowAction(page: Page, row: Locator, patterns: RegExp[]): Promise<string> {
    const roles: ('button' | 'link' | 'menuitem')[] = ['button', 'link', 'menuitem'];
    let control = await firstByName(row, patterns, { timeout: 2500, roles });
    if (!control) {
        const more =
            (await firstByName(row, MORE_MENU, { timeout: 1500, roles: ['button'] })) ??
            ((await row.locator("button[aria-haspopup], button[aria-expanded]").count())
                ? row.locator("button[aria-haspopup], button[aria-expanded]").first()
                : null);
        if (more) {
            await more.click();
            control = await firstByName(page, patterns, { timeout: 3000, roles });
        }
    }
    if (!control) throw new MpError('UI_CHANGED', `no action matching ${patterns.map(String).join(' / ')} on the ad row`);
    const name = (await control.innerText().catch(() => '')) || (await control.getAttribute('aria-label')) || '';
    await control.click();
    return name.trim();
}
