/**
 * delist: remove one of the user's ads from "Mijn advertenties" (row action "Verwijder" -> reason -> confirm).
 * UNVERIFIED flow; run with dryRun first. Verification afterwards: the public listing page returns 404.
 */
import { CookieJar } from 'tough-cookie';

import { firstByName, withBrowser } from '../lib/browser.js';
import { inputError, MpError } from '../lib/errors.js';
import { MpHttp } from '../lib/http.js';
import { clickRowAction, openMyAdRow } from '../lib/myAds.js';
import { DEFAULT_UA } from '../lib/session.js';
import { normalizeListingId, type Input } from '../lib/types.js';
import { fetchListingStats } from './stats.js';

const DELETE_ACTIONS = [/^verwijder/i, /offline halen/i, /beëindig|beeindig/i, /^delete/i];
const REASONS: Record<string, RegExp[]> = {
    sold_on_marktplaats: [/verkocht via marktplaats/i, /via marktplaats verkocht/i, /verkocht op marktplaats/i],
    sold_elsewhere: [/ergens anders/i, /buiten marktplaats/i, /andere (manier|website|site)/i, /elders/i],
    not_sold: [/niet verkocht/i, /wil (het )?niet meer verkopen/i],
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
    const publicHttp = new MpHttp(new CookieJar(), DEFAULT_UA);

    const before = await fetchListingStats(publicHttp, listingId).catch(() => null);
    if (before?.status === 'removed' && !dryRun) {
        return { ok: true, dryRun, listingId, alreadyRemoved: true, verified: true, screenshots: [], notes: ['already offline'] };
    }

    const shots = await withBrowser(input, 'delist', { blockImages: true }, async (run) => {
        const { page, shot, guard } = run;
        const row = await openMyAdRow(run, listingId);
        notes.push(`clicked '${await clickRowAction(page, row, DELETE_ACTIONS)}'`);
        await page.waitForTimeout(1500);
        const dialog = page.locator("[role='dialog'], [role='alertdialog'], [class*='Modal']").last();
        const scope = (await dialog.isVisible().catch(() => false)) ? dialog : page;
        await shot('delete-dialog');

        const reasonControl = await firstByName(scope, REASONS[reason], {
            timeout: 3000,
            roles: ['radio', 'button', 'link'],
        });
        if (reasonControl) {
            await reasonControl.click({ force: true });
            notes.push(`reason: ${reason}`);
        } else {
            const byLabel = scope.getByLabel(REASONS[reason][0]).first();
            if ((await byLabel.count()) > 0) await byLabel.check({ force: true });
            else notes.push(`reason option for '${reason}' not found (dialog may not ask)`);
        }
        await shot('reason');

        const confirm = await firstByName(scope, CONFIRM, { timeout: 4000, roles: ['button'] });
        notes.push(`confirm button: ${confirm ? await confirm.innerText().catch(() => '?') : 'NOT FOUND'}`);
        if (dryRun) {
            await page.keyboard.press('Escape').catch(() => undefined);
            return run.shots;
        }
        if (!confirm) throw new MpError('UI_CHANGED', 'no confirm button in the delete dialog');
        await confirm.click();
        await page.waitForTimeout(3000);
        // A second step (e.g. "who bought it?") may follow; skip it.
        const skip = await firstByName(page, [/overslaan/i, /sla over/i, /nee,? bedankt/i, /^sluiten/i], { timeout: 2500 });
        if (skip) await skip.click().catch(() => undefined);
        await guard();
        await shot('deleted');
        return run.shots;
    });

    let verified: boolean | null = null;
    if (!dryRun) {
        await new Promise((r) => setTimeout(r, 4000));
        const after = await fetchListingStats(publicHttp, listingId).catch(() => null);
        verified = after ? after.status === 'removed' : null;
        if (!verified) notes.push('public page still reachable right after delete (may lag)');
    }
    return {
        ok: true,
        dryRun,
        listingId,
        alreadyRemoved: false,
        verified,
        screenshots: shots.map((s) => ({ step: s.step, url: s.url })),
        notes,
    };
}
