"use client";

import { eur, isClosed, nowLine, planLine } from "@/lib/format";
import { coverFirst } from "@/lib/useItem";
import type { Item } from "@/lib/types";
import { AgentLog } from "./AgentLog";
import { PickupCard } from "./Sold";
import { Button, Eyebrow, PoofTag, PriceTag, StatusPill, cx } from "./ui";

const STAGES = ["Live", "Offers", "Negotiating", "Sold"];

function stageOf(item: Item) {
  if (isClosed(item.status)) return 3;
  const convs = item.conversations.filter((c) => c.state !== "declined");
  if (convs.some((c) => c.messages.some((m) => m.from === "agent")) || item.status === "negotiating") return 2;
  if (item.conversations.length) return 1;
  return 0;
}

/** 10 · How this ad is going. */
export function Overview({ item }: { item: Item }) {
  const photo = coverFirst(item)[0];
  const price = item.listings.find((l) => l.status === "live")?.price ?? item.askPrice;
  const stage = stageOf(item);
  const chats = item.stats?.chats ?? item.conversations.length;
  const numbers = [
    ["views", item.stats?.views],
    ["saves", item.stats?.saves],
    ["chats", chats],
  ].filter((x): x is [string, number] => x[1] != null);
  const plan = planLine(item);
  const sold = item.status === "sold" || item.status === "delisted";

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="relative pt-2">
        <div className="h-[210px] overflow-hidden rounded-[20px] bg-limetint">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {photo && <img src={photo} alt="" className="size-full object-cover" />}
        </div>
        <PriceTag amount={item.sale?.price ?? price} size="md" tilt={8} string dark={!!item.sale} label={item.sale ? "deal" : undefined} className="!absolute right-3 top-0" />
      </div>
      <div>
        <p className="text-[22px] font-extrabold leading-[1.2] tracking-[-0.01em]">{item.title ?? item.recognition?.name}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusPill status={item.status} />
          {item.floorPrice != null && <span className="text-[13px] text-moss">never below {eur(item.floorPrice)}</span>}
        </div>
      </div>

      {/* Stepper */}
      <ol className="grid grid-cols-4 gap-1 pt-1">
        {STAGES.map((s, i) => (
          <li key={s} className="flex flex-col">
            <span className={cx("h-1 rounded-full transition-colors", i <= stage ? "bg-ink" : "bg-line")} />
            <span className={cx("mt-1.5 text-[12px]", i === stage ? "font-bold text-ink" : "text-moss")}>{s}</span>
          </li>
        ))}
      </ol>

      {/* Numbers */}
      {numbers.length > 0 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${numbers.length}, 1fr)` }}>
          {numbers.map(([k, v]) => (
            <div key={k} className="rounded-[16px] bg-card px-3.5 py-3 shadow-soft">
              <p key={v} className="tabular animate-fade text-[22px] font-extrabold leading-none">{v}</p>
              <p className="mt-1 text-[13px] text-moss">{k}</p>
            </div>
          ))}
        </div>
      )}

      {/* Now */}
      <div className="flex items-start gap-2.5 rounded-[16px] bg-limetint px-3.5 py-3">
        <PoofTag className="mt-0.5" />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[12px] font-bold text-moss">
            {!sold && <span className="size-1.5 animate-blink rounded-full bg-ink" />} Now
          </p>
          <p key={nowLine(item)} className="animate-fade text-[16px] font-bold leading-snug">{nowLine(item)}</p>
        </div>
      </div>

      {item.pickup && !sold && <PickupCard pickup={item.pickup} light />}

      <Button href={`/item/${item.id}/chats`} variant={chats ? "primary" : "ghost"} className="w-full">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></svg>
        Open chats ({item.conversations.length})
      </Button>

      {plan && !isClosed(item.status) && (
        <div className="rounded-[16px] bg-card px-4 py-3 shadow-soft">
          <Eyebrow>Price plan</Eyebrow>
          <p className="mt-1 text-[14px] font-bold leading-relaxed tabular">{plan}</p>
        </div>
      )}

      <div className="puff-line" />

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <Eyebrow>Activity log</Eyebrow>
          <span className="text-right text-[12px] text-moss">Everything Poof did · {eur(item.floorPrice)} minimum</span>
        </div>
        <AgentLog item={item} />
      </section>
    </div>
  );
}
