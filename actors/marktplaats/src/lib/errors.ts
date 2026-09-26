/**
 * Every failure the orchestrator (n8n W0) should react to starts with a stable code,
 * so the run's status message can be matched with a simple prefix check.
 */
export type ErrorCode =
    | 'SESSION_EXPIRED' // login wall / 401: a human must run scripts/mp-login again
    | 'CAPTCHA' // a visible captcha or bot wall: a human must look at it
    | 'BLOCKED' // 429 / WAF block after retries: back off, retry later
    | 'INPUT' // bad or missing input
    | 'NOT_FOUND' // listing / conversation does not exist
    | 'UI_CHANGED' // an expected form element was not found (see screenshots)
    | 'FAILED'; // anything else

export class MpError extends Error {
    constructor(
        public readonly code: ErrorCode,
        detail: string,
    ) {
        super(`${code}: ${detail}`);
        this.name = 'MpError';
    }
}

export const inputError = (detail: string) => new MpError('INPUT', detail);
