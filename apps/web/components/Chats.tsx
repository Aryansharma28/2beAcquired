"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PLATFORM, eur, lastTs, offerIn, pickupWhen, timeAgo, unreadIn } from "@/lib/format";
import type { Conversation, Item } from "@/lib/types";
import { Eyebrow, PlatformLogo, cx } from "./ui";

// ---------------------------------------------------------------- 11

/** 11 · Chats for this ad. */
export function ChatList({ item }: { item: Item }) {
  const [openFolded, setOpenFolded] = useState(false);
  const folded = item.conversations.filter((c) => c.state === "declined");
  const active = item.conversations.filter((c) => c.state !== "declined");
  const best = active.filter((c) => bestOffer(c) != null).sort((a, b) => (bestOffer(b) ?? 0) - (bestOffer(a) ?? 0));
  const recent = active.filter((c) => bestOffer(c) == null).sort((a, b) => lastTs(b).localeCompare(lastTs(a)));

  if (!item.conversations.length) {
    return (
      <div className="rounded-3xl border-2 border-dashed border-line px-5 py-10 text-center">
        <p className="font-display text-[22px] font-bold tracking-[-0.02em]">No chats yet</p>
        <p className="mt-1 text-[14.5px] text-ink-2">When a buyer messages, your agent answers within minutes. The chat shows up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {best.length > 0 && <Group title="Best offers" item={item} convs={best} />}
      {recent.length > 0 && <Group title="Recent" item={item} convs={recent} />}
      {folded.length > 0 && (
        <section>
          <button
            onClick={() => setOpenFolded((o) => !o)}
            className="flex w-full items-center justify-between rounded-[22px] bg-card/60 px-4 py-3.5 text-left shadow-soft"
            aria-expanded={openFolded}
          >
            <span className="text-[15px] font-semibold text-ink-2">Lowballers and scams ({folded.length})</span>
            <svg viewBox="0 0 24 24" className={cx("size-5 text-mute transition-transform", openFolded && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {openFolded && (
            <ul className="mt-2 animate-fade overflow-hidden rounded-[22px] bg-card opacity-80 shadow-soft">
              {folded.map((c) => <ChatRow key={c.id} item={item} c={c} />)}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function bestOffer(c: Conversation) {
  const offers = c.messages.filter((m) => m.from === "buyer").map((m) => offerIn(m, c)?.amount).filter((n): n is number => n != null);
  return c.lastOffer ?? offers.at(-1);
}

function Group({ title, item, convs }: { title: string; item: Item; convs: Conversation[] }) {
  return (
    <section>
      <Eyebrow className="mb-2 px-1">{title}</Eyebrow>
      <ul className="overflow-hidden rounded-[22px] bg-card shadow-soft">
        {convs.map((c) => <ChatRow key={c.id} item={item} c={c} />)}
      </ul>
    </section>
  );
}

function ChatRow({ item, c }: { item: Item; c: Conversation }) {
  const last = c.messages.at(-1);
  const offer = bestOffer(c);
  const unread = unreadIn(c) > 0 && c.state !== "declined";
  return (
    <li className="border-b border-line/70 last:border-0">
      <Link href={`/item/${item.id}/chats/${c.id}`} className="flex items-center gap-3 px-3.5 py-3 transition active:bg-paper">
        <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-paper font-display text-[18px] font-bold">
          {c.buyer[0]?.toUpperCase()}
          <PlatformLogo platform={c.platform} className="absolute -bottom-0.5 -right-0.5 !size-[18px] !rounded-[5px] !text-[10px] ring-2 ring-card" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15.5px] font-bold">{c.buyer}</span>
            <Badge state={c.state} />
            <span className="ml-auto shrink-0 text-[11.5px] text-mute">{timeAgo(last?.ts)}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <p className={cx("min-w-0 flex-1 truncate text-[13.5px]", unread ? "font-semibold text-ink" : "text-mute")}>
              {last?.from === "agent" && <span className="text-cobalt">Agent: </span>}
              {last?.text}
            </p>
            {offer != null && c.state !== "declined" && (
              <span className="shrink-0 rounded-full bg-tag px-2 py-0.5 font-mono text-[11.5px] font-bold">{eur(offer)}</span>
            )}
            {unread && <span className="size-2.5 shrink-0 rounded-full bg-cobalt" aria-label="New message" />}
          </div>
        </div>
      </Link>
    </li>
  );
}

export function Badge({ state }: { state: Conversation["state"] }) {
  if (state === "open") return null;
  const s = {
    deal: ["Deal", "bg-go-soft text-go"],
    pickup_scheduled: ["Pickup planned", "bg-go-soft text-go"],
    declined: ["Declined", "bg-line text-mute"],
  }[state];
  return <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold", s[1])}>{s[0]}</span>;
}

// ---------------------------------------------------------------- 12

/** 12 · One negotiation. Read-only: the agent handles it. */
export function Negotiation({ item, c }: { item: Item; c: Conversation }) {
  const serious =
    c.state === "deal" || c.state === "pickup_scheduled" ||
    (item.floorPrice != null && c.messages.some((m) => m.from === "buyer" && (offerIn(m, c)?.amount ?? 0) >= item.floorPrice!));
  const pickup = item.pickup && item.pickup.buyer.split(" ")[0] === c.buyer.split(" ")[0] ? item.pickup : undefined;
  const dealAt = item.sale && item.sale.buyer?.split(" ")[0] === c.buyer.split(" ")[0] ? item.sale.price : undefined;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 px-1">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-card font-display text-[20px] font-bold ring-1 ring-line">{c.buyer[0]?.toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-display text-[24px] font-extrabold leading-none tracking-[-0.03em]">
            {c.buyer}
            <PlatformLogo platform={c.platform} />
          </p>
          <p className="mt-1 text-[13px] text-mute">{PLATFORM[c.platform]}</p>
        </div>
        {c.state === "declined" ? <Badge state="declined" /> : serious && (
          <span className="rounded-full bg-go-soft px-2.5 py-1 text-[12px] font-bold text-go">Serious buyer</span>
        )}
      </div>

      <p className="flex items-center gap-2 rounded-[18px] bg-ink px-4 py-3 text-[14px] font-semibold text-white">
        <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-tag" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /></svg>
        Aiming for {eur(item.askPrice)}, never below {eur(item.floorPrice)}
      </p>

      <Thread c={c} />

      {dealAt != null && (
        <div className="animate-pop rounded-[24px] bg-go p-4 text-white">
          <p className="font-display text-[26px] font-extrabold leading-none tracking-[-0.03em]">Deal at {eur(dealAt)}</p>
          {pickup ? (
            <p className="mt-1.5 text-[14.5px] text-white/90">
              Pickup {pickupWhen(pickup.start).day}, {pickupWhen(pickup.start).time}
              {pickup.addressShared && <> · address shared with {c.buyer.split(" ")[0]}</>}
            </p>
          ) : (
            <p className="mt-1.5 text-[14.5px] text-white/90">Your agent is planning the pickup.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function Thread({ c }: { c: Conversation }) {
  const end = useRef<HTMLDivElement>(null);
  const count = c.messages.length;
  const seen = useRef(count);
  useEffect(() => {
    if (count > seen.current) end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    seen.current = count;
  }, [count]);
  const typing = c.state !== "declined" && c.messages.at(-1)?.from === "buyer";

  return (
    <section className="space-y-2.5 rounded-[26px] bg-card p-3 shadow-soft">
      {c.messages.map((m, i) => {
        const chip = offerIn(m, c);
        const agent = m.from === "agent";
        return (
          <div key={`${m.ts}-${i}`} className={cx("flex animate-rise flex-col gap-1", agent ? "items-end" : "items-start")}>
            {chip && <OfferChip {...chip} />}
            <div
              className={cx(
                "max-w-[84%] px-3.5 py-2.5 text-[15px] leading-snug",
                agent ? "rounded-[20px] rounded-br-md bg-cobalt text-white" : "rounded-[20px] rounded-bl-md bg-paper text-ink",
              )}
            >
              {m.text}
            </div>
            <span className="flex items-center gap-1.5 px-1 text-[10.5px] text-mute">
              {agent && <span className="rounded bg-cobalt-soft px-1 py-px font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-cobalt-deep">Agent</span>}
              {timeAgo(m.ts)}
            </span>
          </div>
        );
      })}
      {typing && (
        <div className="flex animate-fade items-center justify-end gap-2">
          <span className="text-[11px] text-mute">Agent is replying</span>
          <div className="flex gap-1 rounded-[20px] rounded-br-md bg-cobalt/12 px-4 py-3">
            {[0, 150, 300].map((d) => <span key={d} className="size-1.5 animate-blink rounded-full bg-cobalt" style={{ animationDelay: `${d}ms` }} />)}
          </div>
        </div>
      )}
      <div ref={end} className="scroll-mb-28" />
    </section>
  );
}

function OfferChip({ kind, amount }: { kind: "offer" | "counter" | "deal"; amount: number }) {
  const s = {
    offer: ["Offer", "bg-tag text-ink"],
    counter: ["Countered", "bg-cobalt-soft text-cobalt-deep"],
    deal: ["Accepted", "bg-go text-white"],
  }[kind];
  return (
    <span className={cx("inline-flex animate-pop items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[12px] font-bold", s[1])}>
      {kind === "deal" && "✓ "}{s[0]} {eur(amount)}
    </span>
  );
}
