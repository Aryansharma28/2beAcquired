/**
 * delist: remove one of the user's ads. Opens the owner's own ad page (/seller/view/<id>, "Verwijder"), falling back
 * to the row action in "Mijn advertenties"; then reason -> confirm. Existence and the result are checked on the
 * owner's page, never the public one: a fresh ad is 404 publicly for a while although it exists (and can be deleted).
 */
import type { Page } from 'playwright';

import { acceptCookies, firstByName, withBrowser, type BrowserRun } from '../lib/browser.js';
import { inputError, MpError } from '../lib/errors.js';
import { clickRowAction, openMyAdRow } from '../lib/myAds.js';
import { BASE_URL, normalizeListingId, type Input } from '../lib/types.js';

const DELETE_ACTIONS = [/^verwijder/i, /offline halen/i, /beëindig|beeindig/i, /^delete/i];
// The dialog asks "Heb je ... verkocht via Marktplaats?"; answering it deletes the ad (no separate confirm).
const REASONS: Record<string, RegExp[]> = {
    sold_on_marktplaats: [/^verkocht via marktplaats/i, /^via marktplaats verkocht/i, /^verkocht op marktplaats/i],
    sold_elsewhere: [/^niet verkocht via marktplaats/i, /ergens anders/i, /buiten marktplaats/i, /andere (manier|website|site)/i, /elders/i],
    not_sold: [/^niet verkocht via marktplaats/i, /niet verkocht/i, /wil (het )?niet meer verkopen/i],
};
const CONFIRM = [/^verwijder/i, /advertentie verwijderen/i, /^bevestig/i, /^ja\b/i, /^doorgaan/i, /^ok$/i];

export interface DelistResult {
    ok: boolean;
    dryRun: boolean;
    listingId: string;
    alreadyRemoved: boolean;
    verified: boolean | null;
    screenshots: { step: string; url: string }[];
    notes: string[];
}

export async function delist(input: Input): Promise<DelistResult> {
    const listingId = normalizeListingId(input.listingId ?? input.listingUrl);
    if (!listingId) throw inputError("delist needs 'listingId'");
    const dryRun = input.dryRun ?? false;
    const reason = input.delistReason ?? 'sold_elsewhere';
    const notes: string[] = [];
    let alreadyRemoved = false;
    let verified: boolean | null = null;

    const shots = await withBrowser(input, 'delist', { blockImages: true }, async (run) => {
        const { page, shot, guard } = run;
        if (!(await openOwnAd(run, listingId))) {
            alreadyRemoved = true;
            notes.push('not on your seller page: already offline');
            return run.shots;
        }
        const own = await firstByName(page, DELETE_ACTIONS, { timeout: 3000, roles: ['button', 'link'] });
        if (own) {
            await own.click();
            notes.push(`clicked '${(await own.innerText().catch(() => '')).trim()}' on the ad page`);
        } else {
            const row = await openMyAdRow(run, listingId);
            notes.push(`clicked '${await clickRowAction(page, row, DELETE_ACTIONS)}' in Mijn advertenties`);
        }
        await page.waitForTimeout(1500);
        const dialog = page.locator("[role='dialog'], [role='alertdialog'], [class*='Modal']").last();
        const scope = (await dialog.isVisible().catch(() => false)) ? dialog : page;
        await shot('delete-dialog');

        const reasonControl = await firstByName(scope, REASONS[reason], {
            timeout: 3000,
            roles: ['radio', 'button', 'link'],
        });
        if (reasonControl) notes.push(`reason: ${reason} ('${(await reasonControl.innerText().catch(() => '')).trim()}')`);
        await shot('reason');

        if (dryRun) {
            notes.push('dryRun: stopped at the reason question');
            await page.keyboard.press('Escape').catch(() => undefined);
            return run.shots;
        }
        if (!reasonControl) throw new MpError('UI_CHANGED', 'no reason answer in the delete dialog');
        await reasonControl.click();
        await page.waitForTimeout(3000);
        // Older flow: a separate confirm button after the reason.
        if (!/deleteAdSuccess/.test(page.url())) {
            // The current dialog deletes on the reason answer and leaves a disabled confirm button behind: clicking
            // that waited until the run failed although the ad was gone. The seller-page check below decides.
            const confirm = await firstByName(page, CONFIRM, { timeout: 2500, roles: ['button'] });
            if (confirm && (await confirm.isEnabled().catch(() => false))) {
                notes.push(`confirm: ${await confirm.innerText().catch(() => '?')}`);
                await confirm.click({ timeout: 5000 }).catch((e: Error) => notes.push(`confirm click failed: ${e.message.split('\n')[0]}`));
                await page.waitForTimeout(3000);
            }
        }
        // A second step (e.g. "who bought it?") may follow; skip it.
        const skip = await firstByName(page, [/overslaan/i, /sla over/i, /nee,? bedankt/i, /^sluiten/i], { timeout: 2500 });
        if (skip) await skip.click().catch(() => undefined);
        await guard();
        await shot('deleted');
        await page.waitForTimeout(2000);
        verified = !(await openOwnAd(run, listingId));
        if (!verified) notes.push('ad still on your seller page after delete');
        return run.shots;
    });

    return {
        ok: !dryRun ? alreadyRemoved || verified !== false : true,
        dryRun,
        listingId,
        alreadyRemoved,
        verified: alreadyRemoved ? true : verified,
        screenshots: shots.map((s) => ({ step: s.step, url: s.url })),
        notes,
    };
}

/** Open the owner's own page for this ad. True when the ad (still) exists on it. */
async function openOwnAd(run: BrowserRun, listingId: string): Promise<boolean> {
    const { page, guard, shot } = run;
    const response = await page.goto(`${BASE_URL}/seller/view/${listingId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await guard(response);
    await acceptCookies(page);
    const exists = await adShown(page, listingId);
    await shot(exists ? 'own-ad' : 'own-ad-missing');
    return exists;
}

async function adShown(page: Page, listingId: string): Promise<boolean> {
    if ((await page.title().catch(() => '')).match(/niet gevonden|not found|404/i)) return false;
    const text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    return text.includes(listingId) && /verwijder/i.test(text);
}
