"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PLATFORM, eur, lastTs, offerIn, pickupWhen, timeAgo, unreadIn } from "@/lib/format";
import type { Conversation, Item } from "@/lib/types";
import { Eyebrow, PlatformLogo, PoofTag, cx } from "./ui";

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
      <div className="rounded-[20px] bg-card px-5 py-10 text-center shadow-soft">
        <p className="text-[20px] font-extrabold">No chats yet</p>
        <p className="mt-1 text-[14.5px] text-moss">When a buyer messages, Poof answers within minutes. The chat shows up here.</p>
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
            className="flex min-h-12 w-full items-center gap-2 px-3.5 text-left"
            aria-expanded={openFolded}
          >
            <span className="flex-1 text-[15px] font-semibold text-moss">Lowballers and scams ({folded.length})</span>
            <svg viewBox="0 0 24 24" className={cx("size-5 text-moss transition-transform", openFolded && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {openFolded && (
            <ul className="mt-1 animate-fade space-y-2 opacity-80">
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
      <Eyebrow className="mb-2">{title}</Eyebrow>
      <ul className="space-y-2">
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
    <li>
      <Link href={`/item/${item.id}/chats/${c.id}`} className="flex min-h-[74px] items-center gap-3 rounded-[20px] bg-card px-3.5 py-3 shadow-soft transition active:scale-[0.98]">
        <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-limetint text-[15px] font-extrabold">
          {c.buyer[0]?.toUpperCase()}
          <PlatformLogo platform={c.platform} className="absolute -bottom-1 -right-1 !size-5 !rounded-[6px] shadow-soft" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={cx("truncate text-[15px]", unread ? "font-bold" : "font-semibold")}>{c.buyer}</span>
            <Badge state={c.state} />
            <span className="ml-auto shrink-0 text-[12px] text-moss">{timeAgo(last?.ts)}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <p className={cx("min-w-0 flex-1 truncate text-[14px]", unread ? "font-semibold text-ink" : "text-moss")}>
              {last?.from === "agent" && <span className="font-bold text-ink">Poof: </span>}
              {last?.text}
            </p>
            {offer != null && c.state !== "declined" && (
              <span className="shrink-0 rounded-full bg-limetint px-2.5 py-1 text-[13px] font-extrabold tabular">{eur(offer)}</span>
            )}
            {unread && <span className="size-2.5 shrink-0 rounded-full bg-ink" aria-label="New message" />}
          </div>
        </div>
      </Link>
    </li>
  );
}

export function Badge({ state }: { state: Conversation["state"] }) {
  if (state === "open") return null;
  const s = {
    deal: ["Deal", "bg-lime text-ink"],
    pickup_scheduled: ["Pickup planned", "bg-lime text-ink"],
    declined: ["Declined", "bg-line text-moss"],
  }[state];
  return <span className={cx("shrink-0 whitespace-nowrap rounded-[4px] px-1.5 py-px text-[12px] font-bold", s[1])}>{s[0]}</span>;
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
      <div className="flex items-center gap-3">
        <span className="relative grid size-12 shrink-0 place-items-center rounded-full bg-limetint text-[18px] font-extrabold">
          {c.buyer[0]?.toUpperCase()}
          <PlatformLogo platform={c.platform} className="absolute -bottom-1 -right-1 !size-5 !rounded-[6px] shadow-soft" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[20px] font-extrabold leading-tight">{c.buyer}</p>
          <p className="text-[13px] text-moss">{PLATFORM[c.platform]}</p>
        </div>
        {c.state === "declined" ? <Badge state="declined" /> : serious && (
          <span className="shrink-0 whitespace-nowrap rounded-full bg-card px-3 py-1.5 text-[13px] font-bold shadow-soft">Serious buyer</span>
        )}
      </div>

      <p className="flex items-center gap-2 rounded-[16px] bg-limetint px-3.5 py-3 text-[14px] font-semibold">
        <PoofTag />
        Aiming for {eur(item.askPrice)}, never below {eur(item.floorPrice)}
      </p>

      <Thread c={c} />

      {dealAt != null && (
        <div className="flex animate-pop items-center gap-3 rounded-[20px] bg-limetint p-3.5">
          {pickup && (
            <span className="w-[52px] shrink-0 rounded-[12px] bg-card py-1.5 text-center leading-[1.1] shadow-soft">
              <b className="block text-[20px] font-extrabold">{pickupWhen(pickup.start).date}</b>
              <small className="text-[10px] font-bold text-moss">{pickupWhen(pickup.start).month}</small>
            </span>
          )}
          <div className="min-w-0">
            <p className="text-[17px] font-extrabold leading-tight">Deal at {eur(dealAt)}</p>
            {pickup ? (
              <p className="mt-0.5 text-[14px] text-moss">
                Pickup {pickupWhen(pickup.start).day}, {pickupWhen(pickup.start).time}
                {pickup.addressShared && <> · address shared with {c.buyer.split(" ")[0]}</>}
              </p>
            ) : (
              <p className="mt-0.5 text-[14px] text-moss">Poof is planning the pickup.</p>
            )}
          </div>
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
    <section className="space-y-2 pt-1.5">
      {c.messages.map((m, i) => {
        const chip = offerIn(m, c);
        const agent = m.from === "agent";
        return (
          <div key={`${m.ts}-${i}`} className={cx("flex animate-rise flex-col gap-1", agent ? "items-end" : "items-start")}>
            {chip && <OfferChip {...chip} />}
            <div
              className={cx(
                "max-w-[80%] rounded-[18px] px-3.5 py-3 text-[15px] leading-snug",
                agent ? "rounded-br-[6px] bg-lime text-ink" : "rounded-bl-[6px] bg-card text-ink shadow-soft",
              )}
            >
              {agent && <PoofTag className="mb-1.5 flex w-fit" />}
              {m.text}
            </div>
            <span className="px-1 text-[12px] text-moss">{timeAgo(m.ts)}</span>
          </div>
        );
      })}
      {typing && (
        <div className="flex animate-fade items-center justify-end gap-2">
          <span className="text-[12px] text-moss">Poof is replying</span>
          <div className="flex items-center gap-[3px] rounded-[18px] rounded-br-[6px] bg-lime px-4 py-3.5">
            {[0, 150, 300].map((d) => <span key={d} className="size-[5px] rounded-full bg-moss [animation:tdot_1.1s_ease-in-out_infinite]" style={{ animationDelay: `${d}ms` }} />)}
          </div>
        </div>
      )}
      <div ref={end} className="scroll-mb-28" />
    </section>
  );
}

function OfferChip({ kind, amount }: { kind: "offer" | "counter" | "deal"; amount: number }) {
  const s = {
    offer: ["Offer", "bg-card text-ink shadow-soft"],
    counter: ["Countered", "bg-limetint text-ink"],
    deal: ["Accepted", "bg-ink text-lime"],
  }[kind];
  return (
    <span className={cx("inline-flex animate-pop items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-extrabold tabular", s[1])}>
      {kind === "deal" && "✓ "}{s[0]} {eur(amount)}
    </span>
  );
}
