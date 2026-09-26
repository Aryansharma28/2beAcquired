import { Actor } from 'apify';

/** Every action ends here: dataset items for n8n's "get dataset items", OUTPUT for "get record". */
export async function emit(data: unknown): Promise<void> {
    if (Array.isArray(data)) {
        if (data.length) await Actor.pushData(data as Record<string, unknown>[]);
    } else {
        await Actor.pushData(data as Record<string, unknown>);
    }
    await Actor.setValue('OUTPUT', data);
}
