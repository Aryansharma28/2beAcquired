import { Actor } from 'apify';

/** Apify RESIDENTIAL NL proxy; one sticky session per run so all requests share an exit IP. */
export async function proxyUrlFor(useProxy: boolean | undefined): Promise<string | undefined> {
    if (!useProxy) return undefined;
    const config = await Actor.createProxyConfiguration({ groups: ['RESIDENTIAL'], countryCode: 'NL' });
    if (!config) return undefined;
    const session = `mp${Date.now().toString(36)}`;
    return config.newUrl(session);
}
