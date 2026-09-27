"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  PLATFORM, dealBuyer, dealConversation, dealPrice, dealStage, eur, handoverLabel, paidOnline, pickupWhen, recapOf,
} from "@/lib/format";
import { stickerSrc } from "@/lib/useItem";
import type { Item, Pickup, Platform } from "@/lib/types";
import { ChatAvatar, Ic, PlatIcon, PoofLine, Sticker, TYPING } from "./Chats";
import { cx } from "./ui";

// Markup, class names and copy follow design/visual/prototype.html › renderSold (styles under .pv2 in globals.css).

const KEY = (id: string) => `poof:sold:${id}`;

/** Whether this item's poof moment already played in this browser. */
export function soldRevealed(id: string) {
  try { return !!localStorage.getItem(KEY(id)); } catch { return false; }
}
function markRevealed(id: string) {
  try { localStorage.setItem(KEY(id), "1"); } catch { /* storage blocked: it just plays again */ }
}

function sound(src: string, volume: number) {
  try {
    const a = new Audio(src);
    a.volume = volume;
    a.play().catch(() => {});
  } catch { /* no audio: fine */ }
}

/** Handover step label on the button (pickup only for now). */
export const HANDOVER_DONE_LABEL = "Mark as picked up & paid";

/** Platforms the ad was really on. */
export function platformsOf(item: Item): Platform[] {
  return item.listings.length ? [...new Set(item.listings.map((l) => l.platform))] : ["marktplaats"];
}

type Fx = { left: number; top: number; size: number; out: boolean };

/**
 * The sold poof moment. While the deal waits for the handover ("pending") the panel shows the next steps
 * and "Mark as picked up & paid"; once done, the same steps are ticked off.
 */
export function Sold({ item, onProduct, onMarkDone }: { item: Item; onProduct: () => void; onMarkDone: () => Promise<void> }) {
  const done = dealStage(item) === "sold";
  const buyer = dealBuyer(item) ?? "the buyer";
  const price = dealPrice(item);
  const conv = dealConversation(item);
  const recap = recapOf(item);
  const photo = stickerSrc(item);
  const lastMsg = conv?.messages.at(-1);
  const paidLine = paidOnline(item) ? `${buyer} already paid` : `${buyer} pays at pickup`;

  const stage = useRef<HTMLDivElement>(null);
  const sticker = useRef<HTMLSpanElement>(null);
  const [settled] = useState(() => soldRevealed(item.id));
  const [showText, setShowText] = useState(settled);
  const [showPanel, setShowPanel] = useState(settled);
  const [fx, setFx] = useState<Fx | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // playSoldReveal / poofSticker
  useEffect(() => {
    if (settled) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let played = false;
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finish = () => {
      setShowText(true);
      at(250, () => { setShowPanel(true); played = true; });
    };
    at(260, () => {
      const el = sticker.current, host = stage.current;
      if (!el || !host) return finish();
      if (reduce) { el.style.visibility = "hidden"; sound("/brand/poof-success.mp3", 0.6); return finish(); }
      el.animate([
        { transform: "scale(1,1)", opacity: 1 },
        { transform: "scale(1.14,.84)", opacity: 1, offset: 0.45 },
        { transform: "scale(.86,1.18)", opacity: 1, offset: 0.75 },
        { transform: "scale(0,0)", opacity: 0 },
      ], { duration: 300, easing: "ease-in", fill: "forwards" });
      at(190, () => {
        sound("/brand/poof-item.mp3", 0.5);
        const r = el.getBoundingClientRect(), h = host.getBoundingClientRect();
        const size = Math.max(90, Math.min(260, Math.max(r.width, r.height) * 1.8));
        setFx({ size, left: r.left + r.width / 2 - h.left - size / 2, top: r.top + r.height / 2 - h.top - size / 2, out: false });
      });
      at(850, () => { sound("/brand/poof-success.mp3", 0.6); finish(); });
    });
    // Remember it on the way out, so this visit keeps the sold screen and the next one skips the reveal.
    const onHide = () => { if (played) markRevealed(item.id); };
    window.addEventListener("pagehide", onHide);
    return () => { timers.forEach(clearTimeout); window.removeEventListener("pagehide", onHide); onHide(); };
  }, [settled, item.id]);

  const markDone = async () => {
    setBusy(true); setErr(null);
    try { await onMarkDone(); markRevealed(item.id); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not mark it as done"); }
    finally { setBusy(false); }
  };

  return (
    <div className="pv2 soldphone" style={{ position: "fixed", inset: 0, zIndex: 40, maxWidth: 440, margin: "0 auto", display: "flex", flexDirection: "column" }}>
      <div className="soldstage" ref={stage}>
        <button className="icon-btn" type="button" aria-label="Back to the ad" onClick={onProduct} style={{ position: "absolute", top: "calc(env(safe-area-inset-top,0px) + 16px)", left: 16, zIndex: 3, background: "var(--surface)" }}>
          <Ic n="back" />
        </button>
        <Sticker spanRef={sticker} src={photo} tilt={0} size={210} style={settled ? { visibility: "hidden" } : undefined} />
        {fx && (
          <span
            className={cx("poof-fx", fx.out && "out")}
            style={{ width: fx.size, height: fx.size, left: fx.left, top: fx.top }}
            onAnimationEnd={() => {
              setTimeout(() => setFx((f) => f && { ...f, out: true }), 200);
              setTimeout(() => setFx(null), 600);
            }}
          />
        )}
        <div className={cx("sold-text", showText && "show")} aria-live="polite">
          <p className="big"><span className="pb">Sold</span> for {eur(price)}</p>
          <p className="muted">{item.title ?? item.recognition?.name}, to {buyer}</p>
        </div>
        <div className={cx("next-panel", showPanel && "show")}>
          <p className="sec" style={{ marginTop: 0 }}>{done ? "Done" : "Next"}</p>
          <ol className="timeline">
            <li className={done ? "done" : ""}><div><b>{handoverLabel(item)}</b><span>with {buyer}</span></div></li>
            <li className={done ? "done" : ""}><div><b>Get paid {eur(price)}</b><span>{paidLine}</span></div></li>
          </ol>
          {!done && (
            <button className="btn" type="button" disabled={busy} onClick={markDone} style={{ marginTop: 14 }}>{HANDOVER_DONE_LABEL}</button>
          )}
          {err && <p className="xs" style={{ color: "var(--alert)", marginTop: 6 }}>{err}</p>}
          <div className="card recap divided pad" style={{ boxShadow: "var(--shadow-soft)", marginTop: 10 }}>
            <div><span>Time to sell</span><b>{recap.duration}</b></div>
            <div><span>Messages handled</span><b>{recap.messages}</b></div>
            <div><span>Counter offers</span><b>{recap.counters}</b></div>
          </div>
          {conv && (
            <>
              <p className="sec">Conversation with {conv.buyer.split(" ")[0]}</p>
              <Link href={`/item/${item.id}/chats/${encodeURIComponent(conv.id)}`} className="chat-row calm" style={{ marginTop: 2 }}>
                <ChatAvatar letter={conv.buyer[0]?.toUpperCase() ?? "?"} platform={conv.platform} />
                <span className="grow">
                  <span className="top-line"><b className="normal">{conv.buyer}</b></span>
                  <span className="last">{lastMsg ? (lastMsg.from === "agent" ? <PoofLine text={lastMsg.text} /> : lastMsg.text) : ""}</span>
                </span>
                <Ic n="right" />
              </Link>
            </>
          )}
          <p className="sec">Removed from</p>
          <div className="rchips" style={{ marginTop: 2 }}>
            {platformsOf(item).map((p) => {
              const gone = done || item.listings.find((l) => l.platform === p)?.status === "removed";
              return <span key={p}><PlatIcon platform={p} size={20} />{gone ? <Ic n="check" /> : TYPING}{PLATFORM[p]}</span>;
            })}
          </div>
          <button className="btn secondary" type="button" onClick={onProduct} style={{ marginTop: 18 }}>See the ad and all chats</button>
          <Link className="btn ghost" href="/new" style={{ marginTop: 4 }}>Sell something else</Link>
        </div>
      </div>
    </div>
  );
}

/** Calendar-leaf pickup card: "Sat 3 Oct, 14:00 · Mila picks up · address shared". */
export function PickupCard({ pickup, done, light }: { pickup: Pickup; done?: boolean; light?: boolean }) {
  const w = pickupWhen(pickup.start);
  const end = pickupWhen(pickup.end);
  const first = pickup.buyer.split(" ")[0];
  return (
    <section className={cx(
      "relative flex animate-pop items-center gap-3.5 rounded-[20px] bg-limetint p-3.5 text-ink",
      !light && "shadow-float [animation-delay:550ms]",
    )}>
      <div className="w-[56px] shrink-0 overflow-hidden rounded-[12px] bg-card text-center leading-[1.1] shadow-soft">
        <div className="bg-ink py-0.5 text-[10.5px] font-bold text-lime">{w.month}</div>
        <div className="pt-1 text-[22px] font-extrabold">{w.date}</div>
        <div className="pb-1 text-[11px] font-semibold text-moss">{w.weekday}</div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-bold text-moss">
          {done ? "Picked up" : "Pickup"} · {pickup.label ?? w.day}
        </p>
        <p className="tabular text-[18px] font-extrabold leading-tight">
          {w.time}<span className="font-bold text-moss"> – {end.time}</span>
        </p>
        <p className="text-[13.5px] text-moss">
          {first} picks up{pickup.addressShared && <> · address shared with {first}</>}
        </p>
      </div>
    </section>
  );
}
