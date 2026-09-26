"use client";

import { eur, isClosed, nowLine, planLine } from "@/lib/format";
import { coverFirst } from "@/lib/useItem";
import type { Item } from "@/lib/types";
import { AgentLog } from "./AgentLog";
import { PickupCard } from "./Sold";
import { Button, Eyebrow, PriceTag, StatusPill, Tick, cx } from "./ui";

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
      {/* Item card */}
      <div className="flex items-center gap-3.5 rounded-[26px] bg-card p-2.5 pr-4 ring-1 ring-line/60">
        <div className="size-[76px] shrink-0 overflow-hidden rounded-[18px] bg-paper">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {photo && <img src={photo} alt="" className="size-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-display text-[17px] font-bold leading-[1.15] tracking-[-0.02em]">{item.title ?? item.recognition?.name}</p>
          <StatusPill status={item.status} className="mt-1.5" />
        </div>
        <PriceTag amount={item.sale?.price ?? price} size="sm" label={item.sale ? "deal" : undefined} />
      </div>

      {/* Stepper */}
      <ol className="flex items-start px-1">
        {STAGES.map((s, i) => (
          <li key={s} className="flex flex-1 flex-col items-center gap-1.5 last:flex-none">
            <div className="flex w-full items-center">
              <span className={cx("grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold transition-colors",
                i < stage || (i === 3 && stage === 3) ? "bg-cobalt text-white" : i === stage ? "bg-card text-cobalt ring-2 ring-cobalt" : "bg-line text-mute")}>
                {i < stage || (i === 3 && stage === 3) ? <Tick className="size-3.5" /> : i === stage ? <span className="size-2 animate-blink rounded-full bg-cobalt" /> : null}
              </span>
              {i < STAGES.length - 1 && <span className={cx("h-[3px] flex-1 rounded-full", i < stage ? "bg-cobalt" : "bg-line")} />}
            </div>
            <span className={cx("flex w-7 justify-center self-start whitespace-nowrap text-[11.5px] font-semibold", i <= stage ? "text-ink" : "text-mute")}>{s}</span>
          </li>
        ))}
      </ol>

      {/* Numbers */}
      {numbers.length > 0 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${numbers.length}, 1fr)` }}>
          {numbers.map(([k, v]) => (
            <div key={k} className="rounded-[20px] bg-card px-3 py-3 ring-1 ring-line/60">
              <p key={v} className="tabular animate-fade font-mono text-[26px] font-bold leading-none tracking-[-0.04em]">{v}</p>
              <p className="mt-1 text-[12.5px] text-mute">{k}</p>
            </div>
          ))}
        </div>
      )}

      {/* Now */}
      <div className="rounded-[22px] bg-ink px-4 py-3.5 text-white">
        <p className="flex items-center gap-2 font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-tag">
          {!sold && <span className="size-1.5 animate-blink rounded-full bg-tag" />} Now
        </p>
        <p key={nowLine(item)} className="mt-1 animate-fade font-display text-[19px] font-bold leading-tight tracking-[-0.02em]">{nowLine(item)}</p>
      </div>

      {item.pickup && !sold && <PickupCard pickup={item.pickup} light />}

      <Button href={`/item/${item.id}/chats`} variant={chats ? "primary" : "ghost"} className="w-full !py-4 !text-[17px]">
        Open chats ({item.conversations.length})
      </Button>

      {plan && !isClosed(item.status) && (
        <div className="rounded-[20px] bg-tag/35 px-4 py-3">
          <Eyebrow className="!text-ink/60">Price plan</Eyebrow>
          <p className="mt-1 font-mono text-[13px] font-bold leading-relaxed">{plan}</p>
        </div>
      )}

      <section className="pt-2">
        <div className="mb-2 flex items-baseline justify-between px-1">
          <Eyebrow>Activity log</Eyebrow>
          <span className="text-[12px] text-mute">Everything your agent did · {eur(item.floorPrice)} minimum</span>
        </div>
        <AgentLog item={item} />
      </section>
    </div>
  );
}
