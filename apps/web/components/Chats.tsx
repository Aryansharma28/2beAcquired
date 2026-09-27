"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, type CSSProperties, type Ref } from "react";
import {
  PLATFORM, dayLabel, dealConversation, dealPrice, dealStage, eur, lastTs, offerIn, pickupLong, pickupWhen,
} from "@/lib/format";
import { stickerSrc } from "@/lib/useItem";
import type { Conversation, Item, Platform } from "@/lib/types";

// Markup, class names and copy follow design/visual/prototype.html (styles: globals.css › "prototype v2", under .pv2).

// ---------------------------------------------------------------- primitives

const ICONS = {
  back: <path d="M15 5l-7 7 7 7" />,
  right: <path d="M9 5l7 7-7 7" />,
  down: <path d="M5 9l7 7 7-7" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  send: <path d="M4 12l16-8-6 16-2.5-6.5L4 12z" />,
};

/** The prototype's `ic(name)`. */
export function Ic({ n }: { n: keyof typeof ICONS }) {
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden>{ICONS[n]}</svg>;
}

export function Cloudmark() {
  return (
    <svg className="icon cloudmark" viewBox="34 24 138 116" aria-hidden>
      <g fill="currentColor"><circle cx="66" cy="88" r="32" /><circle cx="100" cy="62" r="38" /><circle cx="134" cy="84" r="32" /><circle cx="150" cy="106" r="22" /><circle cx="100" cy="110" r="30" /><circle cx="60" cy="112" r="20" /></g>
    </svg>
  );
}

const EBAY = "/brand/logos/ebay-wordmark.svg";

/** The prototype's `platIcon(key, size)`: white tile with the platform logo. */
export function PlatIcon({ platform, size = 34 }: { platform: Platform; size?: number }) {
  const r = Math.round(size * 0.22);
  const pad = Math.round(size * 0.15);
  const src = platform === "marktplaats" ? "/brand/logos/marktplaats.png" : EBAY;
  return (
    <span aria-hidden style={{ width: size, height: size, borderRadius: r, background: "#fff", border: "1px solid var(--line)", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none", boxSizing: "border-box", padding: pad, overflow: "hidden" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
    </span>
  );
}

/** Chat row avatar: the platform is the big shape, who it is sits as a small letter badge. */
export function ChatAvatar({ letter, platform }: { letter: string; platform: Platform }) {
  return (
    <span className="pavatar">
      <PlatIcon platform={platform} size={40} />
      <span className="who" aria-hidden>{letter}</span>
    </span>
  );
}

/** A line Poof itself said. */
export function PoofLine({ text }: { text: string }) {
  return <><span className="poofsaid"><Cloudmark /> Poof:</span>{text}</>;
}

/** Item photo as a sticker (`sticker(file, tilt)` / `stickerSized`). */
export function Sticker({ src, tilt, size, id, style, spanRef }: { src?: string; tilt: number; size?: number; id?: string; style?: CSSProperties; spanRef?: Ref<HTMLSpanElement> }) {
  return (
    <span ref={spanRef} className="ph cutout sticker" id={id} style={{ ...(size ? { width: size, height: size } : {}), ["--tilt" as string]: `${tilt}deg`, ...style }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt="" />}
    </span>
  );
}

export const TYPING = <span className="typing" aria-hidden><i /><i /><i /></span>;

/** Back icon button: history back when there is one, else the given page. */
export function BackIcon({ href, label = "Back", className, style }: { href: string; label?: string; className?: string; style?: CSSProperties }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={`icon-btn${className ? ` ${className}` : ""}`}
      aria-label={label}
      style={style}
      onClick={() => (window.history.length > 1 ? router.back() : router.push(href))}
    >
      <Ic n="back" />
    </button>
  );
}

// ---------------------------------------------------------------- chat entries

function bestOffer(c: Conversation) {
  const offers = c.messages.filter((m) => m.from === "buyer").map((m) => offerIn(m, c)?.amount).filter((n): n is number => n != null);
  return c.lastOffer ?? (offers.length ? Math.max(...offers) : undefined);
}

type Entry = { c: Conversation; last: string; poofSpoke: boolean; offer?: number; negotiating: boolean };

/** This ad's chats, as the prototype's chat entries (declined ones are folded away separately). */
export function chatEntries(item: Item): Entry[] {
  const closed = dealStage(item) != null;
  const deal = dealConversation(item);
  return item.conversations
    .filter((c) => c.state !== "declined")
    .sort((a, b) => (a === deal ? -1 : b === deal ? 1 : lastTs(b).localeCompare(lastTs(a))))
    .map((c) => {
      const lastMsg = c.messages.at(-1);
      const negotiating = !closed && c.state === "open" && lastMsg?.from === "buyer";
      return {
        c,
        negotiating,
        last: negotiating ? "Poof is negotiating" : lastMsg?.text ?? "No messages yet",
        poofSpoke: !negotiating && lastMsg?.from === "agent",
        offer: closed && c === deal ? dealPrice(item) : bestOffer(c),
      };
    });
}

export function ChatEntryRow({ item, e, idx = 0 }: { item: Item; e: Entry; idx?: number }) {
  return (
    <Link
      href={`/item/${item.id}/chats/${encodeURIComponent(e.c.id)}`}
      className="chat-row calm"
      style={{ animation: "fadeUp .28s var(--out) backwards", animationDelay: `${idx * 35}ms` }}
    >
      <ChatAvatar letter={e.c.buyer[0]?.toUpperCase() ?? "?"} platform={e.c.platform} />
      <span className="grow">
        <span className="top-line"><b className="normal">{e.c.buyer}</b></span>
        <span className="last">{e.negotiating ? <>{TYPING}{e.last}</> : e.poofSpoke ? <PoofLine text={e.last} /> : e.last}</span>
      </span>
      {e.offer != null && <span className="side"><span className="offer-pill">{eur(e.offer)}</span></span>}
    </Link>
  );
}

/** Declined chats (lowballers, scams) folded away. */
export function FoldedLowOffers({ item }: { item: Item }) {
  const folded = item.conversations.filter((c) => c.state === "declined");
  if (!folded.length) return null;
  return (
    <details className="fold">
      <summary>{folded.length} low offer{folded.length === 1 ? "" : "s"}, filtered out <Ic n="down" /></summary>
      <div className="inner">
        {folded.map((c) => {
          const offer = bestOffer(c);
          return (
            <div key={c.id} className="chat-row">
              <ChatAvatar letter={c.buyer[0]?.toUpperCase() ?? "?"} platform={c.platform} />
              <span className="grow">
                <span className="top-line"><b className="normal">{c.buyer}</b></span>
                <span className="last">{offer != null ? `Offered ${eur(offer)}` : "Likely a scam, ignored"}</span>
              </span>
              {offer != null && <span className="side"><span className="offer-pill">{eur(offer)}</span></span>}
            </div>
          );
        })}
      </div>
    </details>
  );
}

function chatSummary(item: Item, entries: Entry[]) {
  if (dealStage(item)) return `Sold for ${eur(dealPrice(item))}`;
  const n = entries.length;
  const offers = entries.map((e) => e.offer).filter((o): o is number => o != null);
  const chats = `${n} chat${n === 1 ? "" : "s"}`;
  return offers.length ? `${chats} · best offer ${eur(Math.max(...offers))}` : chats;
}

// ---------------------------------------------------------------- chats (per ad)

/** Chats: this ad as one group, what needs you first. */
export function ChatList({ item }: { item: Item }) {
  const entries = chatEntries(item);
  const photo = stickerSrc(item);
  return (
    <div className="body2 has-nav" style={{ paddingTop: 28 }}>
      <h1 className="q" style={{ fontSize: 28 }}>Chats</h1>
      <p className="sub" style={{ marginBottom: 18 }}>Per ad. What needs you comes first.</p>
      <div className="group">
        <Link href={`/item/${item.id}`} className="group-head">
          <Sticker src={photo} tilt={-2} />
          <div className="grow"><b>{item.title ?? item.recognition?.name ?? "Your ad"}</b><span>{chatSummary(item, entries)}</span></div>
          <Ic n="right" />
        </Link>
        {entries.map((e, i) => <ChatEntryRow key={e.c.id} item={item} e={e} idx={i} />)}
        <FoldedLowOffers item={item} />
      </div>
      {!item.conversations.length && <p className="muted small">Once your ad is live, its chats show up here.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- one chat

const KIND = { offer: "Offer", counter: "Counter", deal: "Accepted" } as const;

/** One chat: Poof handles it, low offers included. */
export function Negotiation({ item, c }: { item: Item; c: Conversation }) {
  const photo = stickerSrc(item);
  const stage = dealStage(item);
  const isDeal = stage != null && dealConversation(item) === c;
  const pickup = isDeal ? item.pickup : undefined;
  const typing = !stage && c.state === "open" && c.messages.at(-1)?.from === "buyer";
  const first = c.buyer.split(" ")[0];

  const end = useRef<HTMLDivElement>(null);
  const count = c.messages.length;
  const seen = useRef(count);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, []);
  useEffect(() => {
    if (count > seen.current) end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    seen.current = count;
  }, [count]);

  const days = c.messages.map((m) => dayLabel(m.ts));
  return (
    <>
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "var(--page)" }}>
        <div className="top2">
          <BackIcon href={`/item/${item.id}`} />
          <div className="grow"><h1 className="bar-title" style={{ fontSize: 17 }}>{c.buyer}</h1><span className="xs muted">{PLATFORM[c.platform]}</span></div>
        </div>
        <div className="item-row">
          <Sticker src={photo} tilt={-2} />
          <div className="grow">
            <b className="small">{item.title ?? item.recognition?.name}</b>
            <span>{eur(item.askPrice)}, never below {eur(item.floorPrice)}</span>
          </div>
        </div>
      </div>
      <div className="body2">
        <div className="thread">
          {c.messages.map((m, i) => {
            const day = days[i];
            const sep = day && day !== days.slice(0, i).filter(Boolean).at(-1) ? <span className="day">{day}</span> : null;
            const chip = offerIn(m, c);
            const agent = m.from === "agent";
            return (
              <Fragment key={`${m.ts}-${i}`}>
                {sep}
                <div className={agent ? "msg agent-m" : "msg buyer"} style={i === count - 1 ? { animation: "msgPop .22s var(--out)" } : undefined}>
                  {agent ? <span className="who"><span className="agenttag"><Cloudmark />POOF</span></span> : <span className="who">{first}</span>}
                  {chip && <div className={`offer-card${chip.kind === "deal" ? " accepted" : ""}`}><small>{KIND[chip.kind]}</small><b>{eur(chip.amount)}</b></div>}
                  {m.text}
                </div>
              </Fragment>
            );
          })}
          {typing && <div className="msg agent-m"><span className="who"><span className="agenttag"><Cloudmark />POOF</span></span>{TYPING}</div>}
          {isDeal && (
            <div className="deal">
              {pickup && <span className="cal"><small>{pickupWhen(pickup.start).weekday}</small><b>{pickupWhen(pickup.start).date}</b></span>}
              <div>
                <b>Deal at {eur(dealPrice(item))}</b>
                <span className="small muted">
                  {pickup ? <>Pickup {pickupLong(pickup.start)}{pickup.addressShared && <> · address shared with {first}</>}</> : "Poof is planning the pickup."}
                </span>
              </div>
            </div>
          )}
        </div>
        <div ref={end} style={{ scrollMarginBottom: 24 }} />
      </div>
    </>
  );
}
