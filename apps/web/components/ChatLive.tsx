"use client";

import { useEffect, useRef, useState } from "react";
import { PLATFORM, eur, offerIn, timeAgo } from "@/lib/format";
import type { Conversation, Item } from "@/lib/types";
import { ListingPill, PlatformDot, PriceTag, cx } from "./ui";

/** Screen 4: listings live, the agent negotiating per conversation. */
export function ChatLive({ item }: { item: Item }) {
  const convs = item.conversations;
  const latest = [...convs].sort((a, b) => lastTs(b).localeCompare(lastTs(a)))[0];
  const [picked, setPicked] = useState<string | null>(null);
  const active = convs.find((c) => c.id === picked) ?? latest;

  return (
    <div className="space-y-4">
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
        {item.listings.map((l) => <ListingPill key={l.platform} platform={l.platform} status={l.status} />)}
      </div>

      <div className="flex items-center justify-between rounded-3xl bg-card px-4 py-3 ring-1 ring-line/60">
        <div className="text-[13px] leading-tight text-mute">
          <p className="font-semibold text-ink">Asking price</p>
          <p className="mt-0.5">Minimum <span className="font-mono font-bold text-ink">{eur(item.floorPrice)}</span></p>
        </div>
        <PriceTag amount={item.askPrice} size="md" />
      </div>

      {convs.length === 0 ? (
        <div className="animate-rise rounded-3xl border-2 border-dashed border-line px-5 py-8 text-center">
          <p className="font-display text-[20px] font-bold tracking-[-0.02em]">Waiting for buyers</p>
          <p className="mt-1 text-[14px] text-ink-2">The agent answers every message, haggles and plans the pickup.</p>
        </div>
      ) : (
        <>
          <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
            {convs.map((c) => (
              <button
                key={c.id}
                onClick={() => setPicked(c.id)}
                className={cx(
                  "flex shrink-0 animate-pop items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-[13.5px] font-semibold transition-all",
                  c.id === active?.id ? "bg-ink text-white" : "bg-card text-ink ring-1 ring-line",
                )}
              >
                <span className={cx("grid size-7 place-items-center rounded-full font-display text-[13px] font-bold", c.id === active?.id ? "bg-white/15" : "bg-paper")}>
                  {c.buyer[0]?.toUpperCase()}
                </span>
                {c.buyer.split(" ")[0]}
                <PlatformDot platform={c.platform} />
                {(c.state === "deal" || c.state === "pickup_scheduled") && <span className="text-go">✓</span>}
              </button>
            ))}
          </div>
          {active && <Thread key={active.id} c={active} />}
        </>
      )}
    </div>
  );
}

function lastTs(c: Conversation) {
  return c.messages.at(-1)?.ts ?? "";
}

export function Thread({ c }: { c: Conversation }) {
  const end = useRef<HTMLDivElement>(null);
  const count = c.messages.length;
  const seen = useRef(count);
  useEffect(() => {
    if (count > seen.current) end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    seen.current = count;
  }, [count]);
  const typing = c.state === "open" && c.messages.at(-1)?.from === "buyer";

  return (
    <section className="animate-fade rounded-[28px] bg-card p-3 ring-1 ring-line/60">
      <header className="flex items-center justify-between px-1.5 pb-2 pt-1 text-[12.5px] text-mute">
        <span className="flex items-center gap-1.5">
          <PlatformDot platform={c.platform} /> {PLATFORM[c.platform]} · {c.buyer}
        </span>
        <StateBadge state={c.state} />
      </header>
      <div className="space-y-2">
        {c.messages.map((m, i) => {
          const chip = offerIn(m, c);
          const agent = m.from === "agent";
          return (
            <div key={`${m.ts}-${i}`} className={cx("flex animate-rise flex-col gap-1", agent ? "items-end" : "items-start")}>
              {chip && <OfferChip {...chip} />}
              <div
                className={cx(
                  "max-w-[82%] px-3.5 py-2.5 text-[15px] leading-snug",
                  agent ? "rounded-[20px] rounded-br-md bg-cobalt text-white" : "rounded-[20px] rounded-bl-md bg-paper text-ink",
                )}
              >
                {m.text}
              </div>
              <span className="px-1 text-[10.5px] text-mute">
                {agent ? "Agent · " : ""}{timeAgo(m.ts)}
              </span>
            </div>
          );
        })}
        {typing && (
          <div className="flex animate-fade justify-end">
            <div className="flex gap-1 rounded-[20px] rounded-br-md bg-cobalt/12 px-4 py-3">
              {[0, 150, 300].map((d) => <span key={d} className="size-1.5 animate-blink rounded-full bg-cobalt" style={{ animationDelay: `${d}ms` }} />)}
            </div>
          </div>
        )}
        <div ref={end} />
      </div>
    </section>
  );
}

function OfferChip({ kind, amount }: { kind: "offer" | "counter" | "deal"; amount: number }) {
  const s = {
    offer: ["Offer", "bg-tag text-ink"],
    counter: ["Countered", "bg-cobalt-soft text-cobalt-deep"],
    deal: ["Deal", "bg-go text-white"],
  }[kind];
  return (
    <span className={cx("inline-flex animate-pop items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[12px] font-bold", s[1])}>
      {kind === "deal" && "✓ "}{s[0]} {eur(amount)}
    </span>
  );
}

function StateBadge({ state }: { state: Conversation["state"] }) {
  const s = {
    open: ["Negotiating", "text-cobalt"],
    pickup_scheduled: ["Pickup planned", "text-go"],
    deal: ["Deal", "text-go"],
    declined: ["Closed", "text-mute"],
  }[state];
  return <span className={cx("font-semibold", s[1])}>{s[0]}</span>;
}
