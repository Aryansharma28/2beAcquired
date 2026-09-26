import { Actor } from 'apify';

/**
 * Apify RESIDENTIAL NL proxy. With `stickyKey` (the user's session store) every run of that account asks for the
 * same proxy session, so Marktplaats keeps seeing one exit IP instead of a new one per run. Without it: one
 * session per run.
 */
export async function proxyUrlFor(useProxy: boolean | undefined, stickyKey?: string): Promise<string | undefined> {
    if (!useProxy) return undefined;
    const config = await Actor.createProxyConfiguration({ groups: ['RESIDENTIAL'], countryCode: 'NL' });
    if (!config) return undefined;
    const session = stickyKey ? `mp_${stickyKey.replace(/[^\w.~]/g, '_')}`.slice(0, 50) : `mp${Date.now().toString(36)}`;
    return config.newUrl(session);
}
