/**
 * login: let a user log in to Marktplaats from their phone, inside CloakBrowser on this run.
 *
 * The run serves a tiny viewer on the Apify container URL (ACTOR_WEB_SERVER_PORT): a live JPEG
 * screencast of the page (Server-Sent Events) and taps / typing / scrolling sent back as POSTs.
 * The user types their password and SMS code themselves; we only watch for the session to become
 * valid. Then the session is claimed for their poof account through the app's own
 * /api/connect/claim (same endpoint as the poof Connector), with the pairing code the app passed in.
 *
 * Every request needs ?t=<viewToken> (random, chosen by the app, only in this run's input).
 */
import http from 'node:http';

import { Actor, log } from 'apify';
import type { BrowserContext, CDPSession, Page } from 'playwright';

import { acceptCookies, launch } from '../lib/browser.js';
import { MpError, inputError } from '../lib/errors.js';
import { saveSession, type StorageState } from '../lib/session.js';
import { BASE_URL, type Input } from '../lib/types.js';

const LOGIN_URL = `${BASE_URL}/identity/v2/login?target=${encodeURIComponent('/messages')}`;
const VIEWPORT = { width: 400, height: 780 };

export async function login(input: Input) {
    const code = String(input.pairCode ?? '').replace(/\D/g, '');
    // Direct mode (no pairCode): save the session straight into `sessionStore` (the demo/owner store) instead of
    // claiming it for a poof account. Either way the run uses that store's fixed fingerprint + sticky proxy, so the
    // login happens on the same "device" that will post.
    const direct = !code && !!input.sessionStore;
    const poofUrl = String(input.poofUrl || 'https://poof-lovat.vercel.app').replace(/\/+$/, '');
    const token = String(input.viewToken ?? '');
    if (!direct && code.length !== 6) throw inputError("login needs the 6-digit 'pairCode' (or a 'sessionStore' to save to)");
    if (!/^https?:\/\//.test(poofUrl)) throw inputError("login needs 'poofUrl'");
    if (token.length < 16) throw inputError("login needs a 'viewToken' of 16+ characters");
    const minutes = Math.min(Math.max(Number(input.timeoutMinutes ?? 14), 1), 30);

    const browser = await launch(input);
    const context = await browser.newContext({ viewport: VIEWPORT, hasTouch: false });
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);

    // --- live view -------------------------------------------------------------------------
    const clients = new Set<http.ServerResponse>();
    let lastFrame: string | null = null;
    let state: 'loading' | 'ready' | 'saving' | 'done' | 'failed' = 'loading';
    let doneName = '';
    const send = (res: http.ServerResponse, event: string, data: string) => res.write(`event: ${event}\ndata: ${data}\n\n`);
    const broadcast = (event: string, data: string) => clients.forEach((c) => send(c, event, data));
    const setState = (s: typeof state, extra = '') => {
        state = s;
        broadcast('state', JSON.stringify({ state, name: doneName, detail: extra }));
    };

    // The viewer shows (and sends input to) the active page: the login page, or a popup it opened ("Doorgaan met
    // Google"); when the popup closes, back to the login page.
    let active: Page = page;
    let cdp: CDPSession | null = null;
    const watch = async (p: Page) => {
        if (cdp) await cdp.detach().catch(() => undefined);
        active = p;
        cdp = await context.newCDPSession(p);
        const session = cdp;
        session.on('Page.screencastFrame', (f: { data: string; sessionId: number }) => {
            if (session !== cdp) return;
            lastFrame = f.data;
            broadcast('frame', f.data);
            session.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined);
        });
        await session.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: VIEWPORT.width * 2, maxHeight: VIEWPORT.height * 2 });
    };
    await watch(page);
    context.on('page', (popup) => {
        log.info(`popup opened: ${popup.url()}`);
        popup.on('close', () => {
            if (active === popup && !page.isClosed()) watch(page).catch(() => undefined);
        });
        watch(popup).catch((err) => log.warning(`popup view failed: ${(err as Error).message}`));
    });

    let inputLock: Promise<unknown> = Promise.resolve(); // apply inputs strictly in arrival order
    const handleInput = async (msg: { type: string; x?: number; y?: number; text?: string; key?: string; count?: number; dy?: number }) => {
        if (state !== 'ready') return { focus: false };
        if (msg.type === 'tap' && typeof msg.x === 'number' && typeof msg.y === 'number') {
            // Map to the ACTIVE page's real size: a popup (Google sign-in) is smaller than the login page.
            const vp = active.viewportSize() ?? (await active.evaluate(() => ({ width: innerWidth, height: innerHeight })));
            await active.mouse.click(msg.x * vp.width, msg.y * vp.height);
            await active.waitForTimeout(150);
        } else if (msg.type === 'text' && msg.text) {
            await active.keyboard.type(msg.text.slice(0, 200), { delay: 25 });
        } else if (msg.type === 'key' && msg.key && ['Backspace', 'Enter', 'Tab'].includes(msg.key)) {
            for (let i = 0; i < Math.min(Math.max(Number(msg.count) || 1, 1), 60); i++) await active.keyboard.press(msg.key);
        } else if (msg.type === 'scroll' && typeof msg.dy === 'number') {
            await active.mouse.wheel(0, Math.max(-2000, Math.min(2000, msg.dy)));
        } else if (msg.type === 'back') {
            await active.goBack().catch(() => undefined);
        } else if (msg.type === 'restart') {
            if (active !== page) await active.close().catch(() => undefined);
            await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
        }
        // Tell the viewer whether a text field has focus, so it can keep the phone keyboard open.
        // Which kind of field has focus, so the viewer's own input box can match it (password dots, number pad).
        const kind = await active
            .evaluate(() => {
                const el = document.activeElement as HTMLElement | null;
                if (!el) return null;
                if (el.isContentEditable || el.tagName === 'TEXTAREA') return 'text';
                if (el.tagName !== 'INPUT') return null;
                const input = el as HTMLInputElement;
                if (['button', 'submit', 'checkbox', 'radio', 'hidden'].includes(input.type)) return null;
                if (input.type === 'password') return 'password';
                if (input.type === 'email') return 'email';
                if (['tel', 'number'].includes(input.type) || /numeric|decimal/.test(input.inputMode) || input.autocomplete === 'one-time-code') return 'number';
                return 'text';
            })
            .catch(() => null);
        return { focus: !!kind, kind };
    };

    const server = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://x');
        if (url.searchParams.get('t') !== token) {
            res.writeHead(403).end('Forbidden');
            return;
        }
        if (url.pathname === '/events') {
            res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
            clients.add(res);
            send(res, 'state', JSON.stringify({ state, name: doneName }));
            if (lastFrame) send(res, 'frame', lastFrame);
            req.on('close', () => clients.delete(res));
            return;
        }
        if (url.pathname === '/input' && req.method === 'POST') {
            let body = '';
            req.on('data', (c) => (body += c));
            req.on('end', () => {
                let msg;
                try {
                    msg = JSON.parse(body || '{}');
                } catch {
                    res.writeHead(400).end();
                    return;
                }
                const run = inputLock.then(() => handleInput(msg));
                inputLock = run.catch(() => undefined);
                run.then((r) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(r)))
                    .catch((err) => res.writeHead(500).end(String((err as Error).message)));
            });
            return;
        }
        if (url.pathname === '/') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(viewerHtml(poofUrl));
            return;
        }
        res.writeHead(404).end();
    });
    const port = Number(process.env.ACTOR_WEB_SERVER_PORT || process.env.APIFY_CONTAINER_PORT || 4321);
    await new Promise<void>((r) => server.listen(port, r));
    const keepAlive = setInterval(() => broadcast('ping', '1'), 15_000);
    log.info(`viewer on port ${port} (${process.env.ACTOR_WEB_SERVER_URL ?? 'local'})`);

    try {
        await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
        await acceptCookies(page).catch(() => false);
        setState('ready');
        await Actor.setStatusMessage('login: ready');

        // --- wait for a valid session ----------------------------------------------------------
        const deadline = Date.now() + minutes * 60_000;
        let mpUser: { id: string; name: string } | null = null;
        while (!mpUser) {
            if (Date.now() > deadline) throw new MpError('SESSION_EXPIRED', `no login within ${minutes} minutes`);
            await new Promise((r) => setTimeout(r, 3000));
            mpUser = await whoAmI(context);
        }
        log.info(`logged in as ${mpUser.name}`);
        doneName = mpUser.name;
        setState('saving');

        // Let the site set its post-login cookies on a couple of normal pages, like scripts/mp-login does.
        await page.goto(`${BASE_URL}/messages`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
        await page.waitForTimeout(2500);
        await page.goto(`${BASE_URL}/my-account/sell/index.html`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
        await page.waitForTimeout(1500);
        const userAgent = await page.evaluate(() => navigator.userAgent);
        const cookies = (await context.cookies()).filter((c) => c.domain.includes('marktplaats.nl'));

        if (direct) {
            await saveSession(input.sessionStore!, {
                cookies: cookies as StorageState['cookies'],
                origins: [],
                meta: { userAgent, mpUser, savedAt: new Date().toISOString(), source: 'cloud-login' },
            });
            setState('done');
            await new Promise((r) => setTimeout(r, 2500));
            return { ok: true, action: 'login', name: doneName, savedTo: input.sessionStore };
        }
        const res = await fetch(`${poofUrl}/api/connect/claim`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, cookies, userAgent, mpUser, extVersion: 'phone-login' }),
        });
        const out = (await res.json().catch(() => ({}))) as { ok?: boolean; name?: string; error?: string };
        if (!res.ok || !out.ok) throw new MpError('FAILED', `claim failed (HTTP ${res.status}): ${out.error ?? 'unknown'}`);
        doneName = out.name ?? mpUser.name;
        setState('done');
        await new Promise((r) => setTimeout(r, 2500)); // let the viewer show it
        return { ok: true, action: 'login', name: doneName };
    } catch (err) {
        setState('failed', (err as Error).message.slice(0, 200));
        await new Promise((r) => setTimeout(r, 1500));
        throw err;
    } finally {
        clearInterval(keepAlive);
        clients.forEach((c) => c.end());
        server.close();
        await browser.close().catch(() => undefined);
    }
}

async function whoAmI(context: BrowserContext): Promise<{ id: string; name: string } | null> {
    try {
        const count = await context.request.get(`${BASE_URL}/header/messages/message-count`, {
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', Referer: `${BASE_URL}/` },
            failOnStatusCode: false,
        });
        if (count.status() !== 200) return null;
        const res = await context.request.get(`${BASE_URL}/identity/v2/api/user`, {
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', Referer: `${BASE_URL}/` },
            failOnStatusCode: false,
        });
        const j = res.status() === 200 ? await res.json().catch(() => ({})) : {};
        const u = j.user ?? j.data ?? j;
        const name = u.name ?? u.displayName ?? u.firstName ?? u.nickname ?? 'Marktplaats';
        return { id: String(u.id ?? u.userId ?? ''), name: String(name) };
    } catch {
        return null;
    }
}

function viewerHtml(poofUrl: string): string {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Log in to Marktplaats · poof</title>
<style>
:root{--ink:#14110f;--bg:#f6f2ea;--go:#1f8a4c;--mute:#6b645c}
*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden;background:var(--bg);font:15px/1.4 system-ui,-apple-system,sans-serif;color:var(--ink);overscroll-behavior:none}
header{display:flex;align-items:center;gap:8px;padding:8px 12px;font-weight:700}
header .lock{font-size:11.5px;text-align:right;font-weight:600;color:var(--mute);margin-left:auto}
#wrap{position:relative;margin:0 auto;max-width:440px;padding:0 8px}
#screen{display:block;width:auto;max-width:100%;max-height:calc(100dvh - 190px);margin:0 auto;border-radius:14px;background:#fff;box-shadow:0 1px 0 rgba(0,0,0,.08),0 8px 30px rgba(0,0,0,.08);touch-action:none;user-select:none;-webkit-user-select:none}
#type{display:flex;gap:6px;max-width:440px;margin:8px auto 0;padding:0 8px}#type input{flex:1;min-width:0;border:2px solid #d9d2c6;border-radius:12px;padding:10px 12px;font:600 16px system-ui;background:#fff;color:var(--ink)}#type input:focus{outline:none;border-color:#2f5bff}#type button{border:0;border-radius:12px;background:var(--ink);color:#fff;font:700 15px system-ui;padding:0 14px}#hint{max-width:440px;margin:4px auto 0;padding:0 14px;font-size:12.5px;color:var(--mute)}
#bar{display:flex;gap:8px;justify-content:center;padding:8px}
#bar button{border:0;border-radius:999px;background:#fff;padding:9px 14px;font:600 14px system-ui;color:var(--ink);box-shadow:0 1px 0 rgba(0,0,0,.08)}
#msg{position:fixed;inset:0;display:none;place-items:center;background:rgba(246,242,234,.94);text-align:center;padding:24px}
#msg.show{display:grid}#msg h2{margin:.2em 0;font-size:26px}#msg p{color:var(--mute);margin:.4em 0 1.2em}
#msg a{display:inline-block;background:var(--ink);color:#fff;text-decoration:none;border-radius:999px;padding:12px 22px;font-weight:700}
.spin{width:34px;height:34px;border:4px solid #ddd;border-top-color:var(--ink);border-radius:50%;animation:s 1s linear infinite;margin:0 auto}@keyframes s{to{transform:rotate(360deg)}}
</style></head><body>
<header>Log in to Marktplaats<span class="lock">🔒 poof never sees your password</span></header>
<div id="wrap"><img id="screen" alt="Marktplaats login"></div>
<form id="type" autocomplete="off"><input id="kb" type="text" placeholder="Tap a field above, then type here" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go"><button type="button" id="bs" aria-label="Delete">⌫</button><button type="submit">↵</button></form>
<p id="hint">Typing here goes into the field you tapped in the Marktplaats screen.</p>
<div id="bar"><button id="back">← Back</button><button id="restart">↻ Start over</button></div>
<div id="msg" class="show"><div><div class="spin"></div><p>Opening Marktplaats…</p></div></div>
<script>
const t=new URLSearchParams(location.search).get('t'),img=document.getElementById('screen'),kb=document.getElementById('kb'),msg=document.getElementById('msg');
const send=(m)=>fetch('input?t='+encodeURIComponent(t),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(m)}).then(r=>r.json()).catch(()=>({}));
// One request at a time, in order; fast typing is batched into one 'text' message.
let chain=Promise.resolve(),pend=null;
const post=(m)=>{pend=null;return chain=chain.then(()=>send(m))};
const typeText=(s)=>{if(!pend){const p=pend={t:''};chain=chain.then(()=>{if(pend===p)pend=null;return p.t?send({type:'text',text:p.t}):{}})}pend.t+=s};
const show=(html)=>{msg.innerHTML='<div>'+html+'</div>';msg.classList.add('show')};
const es=new EventSource('events?t='+encodeURIComponent(t));
es.addEventListener('frame',e=>{img.src='data:image/jpeg;base64,'+e.data});
es.addEventListener('state',e=>{const s=JSON.parse(e.data);
 if(s.state==='ready')msg.classList.remove('show');
 else if(s.state==='saving')show('<div class="spin"></div><h2>Logged in</h2><p>Connecting your account to poof…</p>');
 else if(s.state==='done'){show('<h2>✓ Connected'+(s.name?' as '+s.name.replace(/</g,''):'')+'</h2><p>poof can now sell for you on Marktplaats.</p><a href="${poofUrl}/" target="_top">Back to poof</a>');try{parent.postMessage({poof:'connected'},'*')}catch(_){}}
 else if(s.state==='failed'){show('<h2>That didn\\'t work</h2><p>'+(s.detail||'').replace(/</g,'')+'</p><a href="${poofUrl}/" target="_top">Back to poof</a>');try{parent.postMessage({poof:'failed'},'*')}catch(_){}}
});
let sy=null,moved=0,prev='';
const hint=document.getElementById('hint');
// Mirror the visible box into the remote field by diff: works with autocorrect, predictive text, paste and Android IMEs.
const reset=()=>{kb.value='';prev=''};
const setKind=(k)=>{kb.type=k==='password'?'password':'text';kb.inputMode=k==='number'?'numeric':k==='email'?'email':'text';
 kb.placeholder=k==='password'?'Type your password here':k==='number'?'Type the code here':k?'Type here':'Tap a field above, then type here';
 hint.textContent=k?'Typing here goes into the field you tapped.':'Tap a field in the Marktplaats screen first.'};
img.addEventListener('pointerdown',e=>{sy=e.clientY;moved=0});
img.addEventListener('pointermove',e=>{if(sy===null)return;const d=sy-e.clientY;if(Math.abs(d)>12){moved+=d;post({type:'scroll',dy:d*2});sy=e.clientY}});
img.addEventListener('pointerup',async e=>{const was=moved;sy=null;if(Math.abs(was)>12)return;const r=img.getBoundingClientRect();
 const res=await post({type:'tap',x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height});
 reset();setKind(res.kind||null);if(res.focus)kb.focus()});
kb.addEventListener('input',()=>{const cur=kb.value;let i=0;while(i<prev.length&&i<cur.length&&prev[i]===cur[i])i++;
 const del=prev.length-i,add=cur.slice(i);prev=cur;
 if(del>0)post({type:'key',key:'Backspace',count:del});if(add)typeText(add)});
document.getElementById('type').addEventListener('submit',e=>{e.preventDefault();post({type:'key',key:'Enter'});reset()});
document.getElementById('bs').onclick=()=>{if(kb.value){kb.value=kb.value.slice(0,-1);kb.dispatchEvent(new Event('input'))}else post({type:'key',key:'Backspace'})};
kb.addEventListener('keydown',e=>{if(e.key==='Backspace'&&!kb.value){e.preventDefault();post({type:'key',key:'Backspace'})}else if(e.key==='Tab'){e.preventDefault();post({type:'key',key:'Tab'});reset()}});
document.getElementById('back').onclick=()=>post({type:'back'});
document.getElementById('restart').onclick=()=>post({type:'restart'});
</script></body></html>`;
}
