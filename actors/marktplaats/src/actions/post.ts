/**
 * post: place a new ad with Playwright on the stored session.
 *
 * Flow (marktplaats.nl/plaats, selectors from spo0nman/opruimer, "verified against the live form 2026-09"):
 *   1. title in `input[name='keywords']` -> "find category" -> pick a suggested category radio -> continue
 *   2. ad form: photos (hidden file input), title, description (rich text editor), condition,
 *      category attributes, delivery radios, price type + price (+ allow bids / minimum bid), postcode,
 *      free visibility plan with every paid extra unticked
 *   3. place (skipped with dryRun) -> decline upsell -> read the new listing id
 *
 * Every step is screenshotted into the default KV store. Selectors NOT covered by opruimer (it never
 * clicks "place") are marked GUESS and need a live check with dryRun first.
 */
import { log } from 'apify';
import type { Locator, Page } from 'playwright';

import { acceptCookies, first, firstByName, withBrowser, type BrowserRun } from '../lib/browser.js';
import { inputError, MpError } from '../lib/errors.js';
import { downloadPhotos } from '../lib/photos.js';
import { BASE_URL, type Input } from '../lib/types.js';

const PLACE_URL = `${BASE_URL}/plaats`;

export const SEL = {
    title: ["input[name='keywords']", '#category-keywords'],
    findCategory: ["[data-testid='findCategory']", '#find-category'],
    categorySuggestion: ["[class*='CategorySuggestion'] input[type='radio']", "#category-suggestions input[type='radio']"],
    categorySubmit: ["[data-testid='redirectToPlaceAd']", '#category-selection-submit'],
    photos: ['#imageUploader-hiddenInput', "input[type='file']"],
    uploadedPhoto: ["#photo-upload button[aria-label='delete']"],
    formTitle: ["input[name='title_nl-NL']"],
    description: ["[data-testid='text-editor-input_nl-NL']", 'div.ql-editor', "textarea[name*='description' i]"],
    descriptionIframe: ['#description_nl-NL_ifr'],
    condition: ["select[name='singleSelectAttribute[condition]']", '#syi-attribute-condition select'],
    priceType: ["select[name='Dropdown-prijstype']"],
    price: ["input[name='price.value']", '#syi-bidding-price input'],
    minBid: ["input[name='price.minimumBidPrice']", '#syi-bidding-minimumprice input'],
    // GUESS: the "allow bids" toggle next to Vraagprijs
    allowBids: ["input[type='checkbox'][name*='bid' i]", "input[type='checkbox'][id*='bid' i]"],
    zip: ["input[name='contactInformation.postCode']", '#postCode input'],
    deliveryRadio: ["input[name='deliveryMethod']"],
    deliverySelect: ['#deliveryMethod select'],
    freePlan: ['#feature-FREE', 'text=Standaard zichtbaarheid'],
    paidExtras: ["input[name^='features.'][type='checkbox']"],
    // GUESS: final submit button
    place: ["[data-testid*='place' i][type='submit']", "[data-testid='submit-button']", '#syi-place-ad-button'],
};
const PLACE_NAMES = [/^plaats( je| jouw)? advertentie/i, /advertentie plaatsen/i, /^plaatsen$/i, /^plaats$/i];
const UPSELL_SKIP = [/nee,? bedankt/i, /doorgaan zonder/i, /overslaan/i, /gratis plaatsen/i, /niet nu/i];

const CONDITION_LABELS: Record<string, string> = {
    new: 'Nieuw',
    as_good_as_new: 'Zo goed als nieuw',
    used: 'Gebruikt',
    refurbished: 'Refurbished',
    not_working: 'Niet werkend',
};
const DELIVERY_IDS: Record<string, string> = { pickup: 'Ophalen', shipping: 'Verzenden', both: 'Ophalen_of_Verzenden' };
const DELIVERY_LABELS: Record<string, RegExp> = {
    pickup: /^ophalen$/i,
    shipping: /^verzenden$/i,
    both: /ophalen of verzenden/i,
};

const ATTRIBUTE_FIELDS_JS = `() => [...document.querySelectorAll("select[name*='Attribute['], input[name*='Attribute[']")]
  .filter(e => !e.name.includes('[condition]') && (e.offsetWidth || e.offsetHeight))
  .map(e => ({
    name: e.name,
    label: e.labels && e.labels[0] ? e.labels[0].innerText.replace('(verplicht)', '').trim() : e.name,
    required: !!(e.required || (e.labels && e.labels[0] && e.labels[0].innerText.includes('verplicht'))),
    kind: e.tagName === 'SELECT' ? 'select' : 'text',
    value: e.value,
    options: e.tagName === 'SELECT' ? [...e.options].map(o => o.text.trim()).filter(t => t && t !== 'Kies...') : [],
  }))`;

export interface Step {
    step: string;
    ok: boolean;
    detail?: string;
}

export interface PostResult {
    ok: boolean;
    dryRun: boolean;
    listingId: string | null;
    url: string | null;
    placeButtonFound: boolean;
    /** From the owner's ad page shortly after placing: Marktplaats moderation may set a fresh ad inactive. */
    visibility?: 'visible' | 'inactive' | 'unknown';
    steps: Step[];
    warnings: string[];
    screenshots: { step: string; url: string }[];
}

/** `word` occurs in `text` as a whole word (no letter/digit right before or after). */
function hasWord(text: string, word: string): boolean {
    const wordChar = (c: string | undefined) => !!c && /[a-z0-9]/.test(c);
    for (let i = text.indexOf(word); i >= 0; i = text.indexOf(word, i + 1)) {
        if (!wordChar(text[i - 1]) && !wordChar(text[i + word.length])) return true;
    }
    return false;
}

async function selectByText(select: Locator, wanted: string): Promise<string | null> {
    const options = (await select.locator('option').allInnerTexts()).map((t) => t.trim());
    const w = wanted.trim().toLowerCase();
    const match =
        options.find((o) => o.toLowerCase() === w) ??
        options.find((o) => o.toLowerCase().startsWith(w)) ??
        options.find((o) => o.toLowerCase().includes(w));
    if (!match) return null;
    await select.selectOption({ label: match });
    return match;
}

function formatEuros(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace('.', ',');
}

async function fillAndCheck(field: Locator, value: string): Promise<string | null> {
    await field.fill(value);
    await field.blur();
    const shown = (await field.inputValue()).trim();
    if (shown === value.trim()) return null;
    const asNumber = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
    if (!Number.isNaN(asNumber(shown)) && asNumber(shown) === asNumber(value)) return null;
    return `Marktplaats changed it to '${shown}'`;
}

async function typeRichText(page: Page, editor: Locator, text: string): Promise<void> {
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    for (const [i, line] of lines.entries()) {
        if (i) await page.keyboard.press('Enter');
        if (line) await page.keyboard.insertText(line);
    }
}

async function findListingIdAfterPlace(run: BrowserRun, title: string): Promise<string | null> {
    const { page, context } = run;
    const fromUrl = /\b(m\d{9,})\b/.exec(page.url());
    if (fromUrl) return fromUrl[1];
    const hrefs = await page
        .locator("a[href*='/v/'], a[href*='/m1'], a[href*='/m2'], a[href*='itemId=']")
        .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href))
        .catch(() => [] as string[]);
    for (const href of hrefs) {
        const m = /\b(m\d{9,})\b/.exec(href) ?? /itemId=(m?\d{9,})/.exec(href);
        if (m) return m[1].startsWith('m') ? m[1] : `m${m[1]}`;
    }
    // Last resort: ask the account API for the newest own ad with this title (cookies come from the context).
    try {
        const res = await context.request.get(`${BASE_URL}/my-account/sell/api/listings?batchNumber=1&batchSize=20`, {
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        });
        if (res.ok()) {
            const ads: any[] = (await res.json())?.ads ?? [];
            const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
            const hit = ads.find((a) => norm(String(a.title ?? '')) === norm(title)) ?? null;
            if (hit?.itemId) return String(hit.itemId);
        }
    } catch (err) {
        log.warning(`listing lookup via my-account API failed: ${(err as Error).message}`);
    }
    return null;
}

export async function post(input: Input): Promise<PostResult> {
    const title = input.title?.trim();
    const description = input.description?.trim();
    if (!title) throw inputError("post needs 'title'");
    if (title.length > 60) throw inputError(`title is ${title.length} chars; Marktplaats allows 60`);
    if (!description) throw inputError("post needs 'description'");
    const priceType = input.priceType ?? 'Vraagprijs';
    const needsPrice = priceType === 'Vraagprijs';
    if (needsPrice && (input.price === undefined || input.price === null)) throw inputError("post needs 'price' for Vraagprijs");
    if (!input.photoUrls?.length) throw inputError("post needs at least one entry in 'photoUrls'");
    const dryRun = input.dryRun ?? false;
    const delivery = input.delivery ?? 'pickup';

    const photoPaths = await downloadPhotos(input.photoUrls, input.photoStore || 'tba-photos');

    return withBrowser(input, 'post', { blockImages: false }, async (run) => {
        const { page, shot, guard, shots } = run;
        const steps: Step[] = [];
        const warnings: string[] = [];
        const step = (name: string, ok: boolean, detail?: string) => {
            steps.push({ step: name, ok, detail });
            const line = `[post] ${ok ? 'ok ' : 'NOK'} ${name}${detail ? `: ${detail}` : ''}`;
            if (ok) log.info(line);
            else log.warning(line);
            if (!ok) warnings.push(`${name}${detail ? `: ${detail}` : ''}`);
        };
        const hard = async (name: string, detail: string): Promise<never> => {
            step(name, false, detail);
            await shot(`failed-${name}`);
            throw new MpError('UI_CHANGED', `${name}: ${detail}`);
        };
        /** Soft step: a failure is reported but does not stop the run (the site's own validation is the judge). */
        const attempt = async (name: string, fn: () => Promise<string | null | undefined>) => {
            try {
                const problem = await fn();
                step(name, !problem, problem ?? undefined);
            } catch (err) {
                step(name, false, (err as Error).message.split('\n')[0].slice(0, 200));
            }
        };

        // 0. open the place-ad page
        // 'commit' + a wait for the form below: slow proxies can take long to fire DOMContentLoaded. One retry.
        let response = await page.goto(PLACE_URL, { waitUntil: 'commit' }).catch(() => null);
        if (!response || !(await page.locator(SEL.title.join(', ')).first().waitFor({ timeout: 30_000 }).then(() => true, () => false))) {
            log.warning('place-ad page slow; retrying once');
            response = await page.goto(PLACE_URL, { waitUntil: 'commit', timeout: 90_000 });
        }
        await page.waitForTimeout(2000); // client-side redirect to the login page happens here
        await guard(response);
        if (await acceptCookies(page)) step('cookie banner accepted', true);
        // One-time "Type verkoper" modal (private vs business seller): poof sells personal items.
        const privateSeller = await firstByName(page, [/^particuliere verkoper$/i], { timeout: 3000, roles: ['button'] });
        if (privateSeller) {
            await privateSeller.click();
            await page.waitForTimeout(1000);
            step('seller type: particulier', true);
        }
        step('logged in', true, page.url());
        await shot('start');

        // 1. title -> category
        const keywords = await first(page, SEL.title, { timeout: 15_000 });
        if (!keywords) await hard('title', 'keywords field not found on /plaats');
        await keywords!.fill(title);
        step('title', true, title);

        const findButton = await first(page, SEL.findCategory, { timeout: 3000 });
        if (findButton) await findButton.click();
        else await keywords!.press('Enter');
        const suggestion = await first(page, SEL.categorySuggestion, { timeout: 8000, state: 'attached' });
        let categoryPicked: string | null = null;
        if (suggestion) {
            const radios = page.locator(SEL.categorySuggestion.join(", "));
            const labels: string[] = await radios.evaluateAll((els) =>
                els.map((el) => {
                    const input = el as HTMLInputElement;
                    const label = input.closest('label') ?? input.labels?.[0] ?? input.parentElement;
                    return (label?.textContent ?? input.value ?? '').replace(/\s+/g, ' ').trim();
                }),
            );
            let index = 0;
            const hint = input.categoryHint?.trim().toLowerCase();
            if (hint) {
                const found = labels.findIndex((l) => l.toLowerCase().includes(hint));
                if (found >= 0) index = found;
                else warnings.push(`categoryHint '${input.categoryHint}' not among suggestions: ${labels.join(' | ')}`);
            }
            await radios.nth(index).check({ force: true });
            categoryPicked = labels[index] ?? null;
            log.info(`category suggestions: ${labels.join(' | ')}`);
        }
        await shot('category');
        const submit = await first(page, SEL.categorySubmit, { timeout: 6000 });
        if (!submit) await hard('category', `no category continue button (suggestion radio found: ${Boolean(suggestion)})`);
        await submit!.click();
        step('category', true, categoryPicked ?? 'site default');

        // 2. the ad form
        const photosInput = await first(page, SEL.photos, { timeout: 20_000, state: 'attached' });
        if (!photosInput) await hard('ad form', 'the ad form did not open after choosing the category');
        await guard();

        // photos
        {
            const multiple = (await photosInput!.getAttribute('multiple')) !== null;
            if (multiple) await photosInput!.setInputFiles(photoPaths);
            else {
                for (const path of photoPaths) {
                    await page.locator(SEL.photos[0]).first().setInputFiles(path);
                    await page.waitForTimeout(1500);
                }
            }
            const uploaded = page.locator(SEL.uploadedPhoto[0]);
            const deadline = Date.now() + 45_000;
            while ((await uploaded.count()) < photoPaths.length && Date.now() < deadline) await page.waitForTimeout(500);
            const count = await uploaded.count();
            if (count === 0) await hard('photos', `none of ${photoPaths.length} photos showed up in the form`);
            step(`photos`, count >= photoPaths.length, `${count}/${photoPaths.length} uploaded`);
        }
        await shot('photos');

        await attempt('title on form', async () => {
            const field = await first(page, SEL.formTitle, { timeout: 3000 });
            if (!field) return 'form title field not found (the step-1 title is used)';
            return fillAndCheck(field, title);
        });

        await attempt('description', async () => {
            const iframeSel = SEL.descriptionIframe[0];
            const hasIframe = (await page.locator(iframeSel).count()) > 0;
            const editor = hasIframe
                ? page.frameLocator(iframeSel).locator('body')
                : await first(page, SEL.description, { timeout: 4000 });
            if (!editor) return 'description editor not found';
            await typeRichText(page, editor, description);
            const shown = (await editor.innerText()).replace(/\s+/g, ' ').trim();
            const wanted = description.replace(/\s+/g, ' ').trim();
            return shown.slice(0, 80) === wanted.slice(0, 80) ? null : 'text in the editor differs from the input';
        });

        await attempt(`condition`, async () => {
            const select = await first(page, SEL.condition, { timeout: 3000, state: 'attached' });
            if (!select) return 'this category has no condition field';
            const wanted = CONDITION_LABELS[input.condition ?? 'used'] ?? input.condition ?? 'Gebruikt';
            const picked = await selectByText(select, wanted);
            return picked ? null : `no option like '${wanted}'`;
        });

        await attempt('category attributes', async () => {
            const fields: any[] = await page.evaluate(`(${ATTRIBUTE_FIELDS_JS})()`);
            const given = Object.entries(input.attributes ?? {});
            const lookup = (f: any) =>
                given.find(([k]) => k === f.name || k.toLowerCase() === String(f.label).toLowerCase())?.[1] ??
                given.find(([k]) => String(f.label).toLowerCase().startsWith(k.toLowerCase()))?.[1];
            const missing: string[] = [];
            for (const f of fields) {
                const control = page.locator(`[name="${f.name}"]`).first();
                const value = lookup(f);
                if (value !== undefined && value !== '') {
                    if (f.kind === 'select') {
                        if (!(await selectByText(control, String(value)))) missing.push(`${f.label} (no option '${value}')`);
                    } else await control.fill(String(value));
                    continue;
                }
                if (!f.required || f.value) continue;
                if (f.kind === 'select') {
                    // An option named in the title or description (brand "Apple", colour "wit") beats "Overige".
                    const text = `${title} ${description}`.toLowerCase();
                    const named = f.options
                        .filter((o: string) => o.length >= 3 && !/overig|anders|other|onbekend|geen/i.test(o))
                        .sort((a: string, b: string) => b.length - a.length)
                        .find((o: string) => hasWord(text, o.toLowerCase()));
                    if (named) {
                        await control.selectOption({ label: named });
                        continue;
                    }
                    const fallback = f.options.find((o: string) => /overig|anders|other|onbekend|geen/i.test(o));
                    if (fallback) {
                        await control.selectOption({ label: fallback });
                        warnings.push(`attribute '${f.label}' defaulted to '${fallback}'`);
                        continue;
                    }
                }
                missing.push(f.label);
            }
            return missing.length ? `required and not filled: ${missing.join(', ')}` : null;
        });

        await attempt(`delivery: ${delivery}`, async () => {
            if ((await page.locator(SEL.deliveryRadio[0]).count()) > 0) {
                const byId = page.locator(`input[name='deliveryMethod'][id='${DELIVERY_IDS[delivery]}']`);
                if ((await byId.count()) > 0) await byId.first().check({ force: true });
                else await page.getByLabel(DELIVERY_LABELS[delivery]).first().check({ force: true });
                return delivery === 'pickup' ? null : 'shipping carrier / package size left at the site default';
            }
            const select = await first(page, SEL.deliverySelect, { timeout: 1500, state: 'attached' });
            if (!select) return 'delivery options not found';
            return (await selectByText(select, DELIVERY_IDS[delivery].replace(/_/g, ' '))) ? null : 'no matching delivery option';
        });

        await attempt(`price type: ${priceType}`, async () => {
            const select = await first(page, SEL.priceType, { timeout: 2500, state: 'attached' });
            if (!select) return 'price type dropdown not found';
            return (await selectByText(select, priceType)) ? null : `no option '${priceType}'`;
        });

        if (input.price !== undefined && input.price !== null) {
            await attempt(`price: EUR ${input.price}`, async () => {
                const field = await first(page, SEL.price, { timeout: 3000 });
                if (!field) return 'price field not found';
                return fillAndCheck(field, formatEuros(input.price!));
            });
            if (!steps.at(-1)!.ok && needsPrice) await hard('price', steps.at(-1)!.detail ?? 'price not set');
        }

        if (needsPrice) {
            const allowBids = input.allowBids ?? true;
            await attempt(`allow bids: ${allowBids}`, async () => {
                let toggle = await first(page, SEL.allowBids, { timeout: 1500, state: 'attached' });
                if (!toggle) {
                    const byLabel = page.getByLabel(/bieden toestaan|biedingen toestaan|bieden mogelijk/i).first();
                    if ((await byLabel.count()) > 0) toggle = byLabel;
                }
                if (!toggle) {
                    // Some layouts show the minimum-bid field whenever bidding is on; no toggle needed then.
                    const minBidVisible = await first(page, SEL.minBid, { timeout: 500 });
                    return minBidVisible || !allowBids ? null : "'allow bids' toggle not found";
                }
                if ((await toggle.isChecked()) !== allowBids) await toggle.setChecked(allowBids, { force: true });
                return null;
            });
            if ((input.allowBids ?? true) && input.minBid) {
                await attempt(`minimum bid: EUR ${input.minBid}`, async () => {
                    const field = await first(page, SEL.minBid, { timeout: 2500 });
                    if (!field) return 'minimum bid field not found';
                    return fillAndCheck(field, formatEuros(input.minBid!));
                });
            }
        }

        await attempt('postcode', async () => {
            const field = await first(page, SEL.zip, { timeout: 2500 });
            if (!field) return 'postcode field not found';
            if ((await field.inputValue()).trim()) return null;
            if (!input.postcode) return "postcode is empty on the form and no 'postcode' input was given";
            await field.fill(input.postcode.replace(/\s+/g, '').toUpperCase());
            return null;
        });

        await attempt('free plan, no paid extras', async () => {
            const plan = await first(page, SEL.freePlan, { timeout: 2500, state: 'attached' });
            if (plan) await plan.check({ force: true }).catch(() => plan.click({ force: true }));
            const extras = page.locator(SEL.paidExtras[0]);
            for (let i = 0; i < (await extras.count()); i++) {
                if (await extras.nth(i).isChecked()) await extras.nth(i).setChecked(false, { force: true });
            }
            const stillTicked = await extras.evaluateAll((els) => els.filter((e) => (e as HTMLInputElement).checked).length);
            if (stillTicked) return `${stillTicked} paid extra(s) still ticked`;
            return plan ? null : 'free plan option not found (no paid extra is ticked)';
        });

        // 3. place
        const placeButton =
            (await first(page, SEL.place, { timeout: 1500 })) ?? (await firstByName(page, PLACE_NAMES, { timeout: 4000, roles: ['button'] }));
        step('place button located', Boolean(placeButton), placeButton ? await placeButton.innerText().catch(() => '') : 'not found');
        if (placeButton) await placeButton.scrollIntoViewIfNeeded().catch(() => undefined);
        await shot('form-complete');

        const screenshots = () => shots.map((s) => ({ step: s.step, url: s.url }));
        if (dryRun) {
            return {
                ok: steps.every((s) => s.ok),
                dryRun: true,
                listingId: null,
                url: null,
                placeButtonFound: Boolean(placeButton),
                steps,
                warnings,
                screenshots: screenshots(),
            };
        }
        if (!placeButton) await hard('place', 'place button not found');

        await placeButton!.click();
        await page.waitForTimeout(3000);
        const upsell = await firstByName(page, UPSELL_SKIP, { timeout: 5000 });
        if (upsell) {
            await shot('upsell');
            await upsell.click();
            step('declined upsell', true);
        }
        await page.waitForURL((url) => !/\/plaats(\/|$|\?)/.test(url.pathname + url.search) || /m\d{9,}/.test(url.href), {
            timeout: 45_000,
        }).catch(() => undefined);
        await guard();
        await shot('placed');

        if (/\/plaats(\/|$|\?)/.test(new URL(page.url()).pathname) && !/m\d{9,}/.test(page.url())) {
            const errors = await page
                .locator("[role='alert'], [class*='error' i]:visible, [class*='Error']:visible")
                .allInnerTexts()
                .catch(() => [] as string[]);
            const text = errors.map((t) => t.trim()).filter(Boolean).slice(0, 8).join(' | ');
            throw new MpError('FAILED', `still on the place-ad form after clicking place${text ? `; form errors: ${text}` : ''}`);
        }
        const listingId = await findListingIdAfterPlace(run, title);
        step('listing id', Boolean(listingId), listingId ?? 'not found; check my-account');
        let visibility: PostResult['visibility'] = 'unknown';
        if (listingId) {
            await page.waitForTimeout(8000);
            await page.goto(`${BASE_URL}/seller/view/${listingId}`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
            await page.waitForTimeout(2000);
            const body = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
            visibility = /niet zichtbaar op marktplaats|op inactief/i.test(body) ? 'inactive' : body.includes(listingId) ? 'visible' : 'unknown';
            step('visibility', visibility !== 'inactive', visibility);
            await shot('visibility');
        }
        return {
            ok: true,
            dryRun: false,
            listingId,
            url: listingId ? `${BASE_URL}/${listingId}` : page.url(),
            placeButtonFound: true,
            visibility,
            steps,
            warnings,
            screenshots: screenshots(),
        };
    });
}
