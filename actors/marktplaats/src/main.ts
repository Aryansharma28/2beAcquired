/**
 * 2beAcquired Marktplaats actor. Input { action, ...params }; see .actor/input_schema.json and README.md.
 * Every action pushes its result to the default dataset AND stores it as OUTPUT in the default KV store.
 * Failures end the run as FAILED with a status message that starts with an error code
 * (SESSION_EXPIRED, CAPTCHA, BLOCKED, INPUT, NOT_FOUND, UI_CHANGED, FAILED).
 */
import { Actor, log } from 'apify';

import { comps } from './actions/comps.js';
import { delist } from './actions/delist.js';
import { inbox } from './actions/inbox.js';
import { post } from './actions/post.js';
import { reply } from './actions/reply.js';
import { stats } from './actions/stats.js';
import { updatePrice } from './actions/update_price.js';
import { MpError } from './lib/errors.js';
import { emit } from './lib/output.js';
import type { Action, Input } from './lib/types.js';

const ACTIONS: Record<Action, (input: Input) => Promise<unknown>> = {
    comps,
    inbox,
    reply,
    stats,
    post,
    update_price: updatePrice,
    delist,
};

await Actor.init();

const input = (await Actor.getInput<Input>()) ?? ({} as Input);
const action = input.action;

try {
    const handler = ACTIONS[action];
    if (!handler) throw new MpError('INPUT', `unknown action '${String(action)}'; use one of ${Object.keys(ACTIONS).join(', ')}`);
    log.info(`action=${action}${input.dryRun ? ' (dryRun)' : ''}`);
    const result = await handler(input);
    await emit(result);
    const count = Array.isArray(result) ? `${result.length} item(s)` : 'done';
    await Actor.exit(`${action}: ${count}`);
} catch (err) {
    const message = err instanceof MpError ? err.message : `FAILED: ${(err as Error)?.message ?? String(err)}`;
    log.error(message);
    await Actor.setValue('OUTPUT', { ok: false, action, error: message, code: message.split(':')[0] });
    await Actor.fail(message);
}
