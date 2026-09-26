import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Actor, log } from 'apify';

import { MpError } from './errors.js';

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

/**
 * Photos come as https URLs, `data:` URIs, or keys in the photo KV store (default `tba-photos`,
 * where W1 saves them). Everything is written to temp files for setInputFiles().
 */
export async function downloadPhotos(entries: string[], photoStore = 'tba-photos'): Promise<string[]> {
    const dir = await mkdtemp(join(tmpdir(), 'mp-photos-'));
    const paths: string[] = [];
    for (const [i, entry] of entries.slice(0, 24).entries()) {
        let buffer: Buffer;
        let type = 'image/jpeg';
        if (/^https?:\/\//i.test(entry)) {
            // Our own photo store isn't public: authenticate Apify API URLs with the run's token.
            const headers: Record<string, string> = {};
            if (/^https:\/\/api\.apify\.com\//i.test(entry) && process.env.APIFY_TOKEN) headers.Authorization = `Bearer ${process.env.APIFY_TOKEN}`;
            const res = await fetch(entry, { redirect: 'follow', headers });
            if (!res.ok) throw new MpError('INPUT', `photo ${i + 1} could not be downloaded (HTTP ${res.status}): ${entry}`);
            type = (res.headers.get('content-type') ?? type).split(';')[0].trim();
            buffer = Buffer.from(await res.arrayBuffer());
        } else if (entry.startsWith('data:')) {
            const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(entry);
            if (!m) throw new MpError('INPUT', `photo ${i + 1} is a malformed data URI`);
            type = m[1] ?? type;
            buffer = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]));
        } else {
            const store = await Actor.openKeyValueStore(photoStore);
            const value = await store.getValue<Buffer | string>(entry);
            if (value === null || value === undefined) {
                throw new MpError('INPUT', `photo ${i + 1}: key '${entry}' not found in KV store '${photoStore}'`);
            }
            buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'base64');
        }
        if (buffer.length < 1000) throw new MpError('INPUT', `photo ${i + 1} is too small to be an image (${buffer.length} bytes)`);
        const path = join(dir, `photo-${String(i + 1).padStart(2, '0')}.${EXT[type] ?? 'jpg'}`);
        await writeFile(path, buffer);
        paths.push(path);
    }
    log.info(`Downloaded ${paths.length} photo(s) to ${dir}`);
    return paths;
}
