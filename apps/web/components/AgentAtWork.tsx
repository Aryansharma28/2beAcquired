"use client";

import { eur } from "@/lib/format";
import type { Comp, Item } from "@/lib/types";
import { PlatformDot, PriceTag, Tick, cx } from "./ui";

/** Screen 2: the agent recognising, researching and pricing the item. */
export function AgentAtWork({ item }: { item: Item }) {
  const working = item.status === "analyzing";
  return (
    <div className="space-y-3">
      <PhotoScan item={item} scanning={working} />
      <StepList item={item} working={working} />
    </div>
  );
}

function PhotoScan({ item, scanning }: { item: Item; scanning: boolean }) {
  const photo = item.photos[0];
  return (
    <div className="relative aspect-[16/10] overflow-hidden rounded-[28px] bg-ink">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photo && <img src={photo} alt="" className={cx("size-full object-cover transition duration-700", scanning && "saturate-[0.85]")} />}
      {scanning && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(43,59,255,0.10)_1px,transparent_1px),linear-gradient(90deg,rgba(43,59,255,0.10)_1px,transparent_1px)] bg-[size:28px_28px]" />
          <div className="pointer-events-none absolute inset-x-0 h-24 -translate-y-full animate-scan bg-gradient-to-b from-transparent to-cobalt/45">
            <div className="absolute inset-x-0 bottom-0 h-[2px] bg-white shadow-[0_0_12px_2px_rgba(43,59,255,0.9)]" />
          </div>
        </>
      )}
      {item.title && (
        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
          <div className="animate-pop rounded-2xl bg-card/95 px-3.5 py-2 shadow-lg backdrop-blur">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-cobalt">Recognised</p>
            <p className="font-display text-[18px] font-bold leading-tight tracking-[-0.02em]">{item.title}</p>
            {item.condition && <p className="text-[12.5px] text-mute">{item.condition}</p>}
          </div>
          {item.askPrice != null && <PriceTag amount={item.askPrice} size="md" tilt={-6} className="mb-1 animate-pop" label="ask" />}
        </div>
      )}
    </div>
  );
}

function StepList({ item, working }: { item: Item; working: boolean }) {
  const events = item.events;
  const hasComps = !!item.comps?.length;
  // Show the comps chart right under the step that reported them (or at the end).
  let compsAt = events.findIndex((e) => /comparable/i.test(e.text));
  if (hasComps && compsAt < 0) compsAt = events.length - 1;
  return (
    <ol className="rounded-[28px] bg-card p-2 ring-1 ring-line/60">
      {events.map((e, i) => {
        const isDecision = e.type === "decision";
        return (
          <li
            key={`${e.ts}-${i}`}
            className={cx("flex animate-rise items-start gap-3 rounded-2xl px-3 py-2", isDecision && "bg-tag/35")}
          >
            <span className={cx("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full", e.type === "error" ? "bg-alert text-white" : isDecision ? "bg-ink text-tag" : "bg-cobalt text-white")}>
              <Tick className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className={cx("text-[15px] leading-snug", isDecision ? "font-bold" : "font-medium")}>{e.text}</p>
              {hasComps && i === compsAt && <CompsChart item={item} />}
            </div>
          </li>
        );
      })}
      {working && (
        <li className="flex items-center gap-3 px-3 py-2.5">
          <span className="relative grid size-6 shrink-0 place-items-center">
            <span className="absolute size-6 animate-ping rounded-full bg-cobalt/30" />
            <span className="size-2.5 rounded-full bg-cobalt" />
          </span>
          <span className="skeleton h-3.5 w-2/3 rounded-full" />
        </li>
      )}
    </ol>
  );
}

/** Histogram of comparable prices, the agent's range as a band, the ask as a tag. */
function CompsChart({ item }: { item: Item }) {
  const comps = item.comps!;
  const prices = comps.map((c) => c.price);
  const min = Math.floor(Math.min(...prices) / 10) * 10;
  const max = Math.ceil((Math.max(...prices) + 1) / 10) * 10;
  const bins: number[] = [];
  for (let b = min; b < max; b += 10) bins.push(comps.filter((c) => c.price >= b && c.price < b + 10).length);
  const peak = Math.max(...bins, 1);
  const range = item.priceRange ?? { low: Math.min(...prices), mid: 0, high: Math.max(...prices) };
  const pct = (v: number) => ((v - min) / (max - min)) * 100;

  return (
    <div className="animate-fade pt-2">
      <div className="relative mt-4 h-[64px]">
        <div
          className="absolute inset-y-0 rounded-md bg-cobalt-soft"
          style={{ left: `${pct(range.low)}%`, width: `${pct(range.high) - pct(range.low)}%` }}
        />
        <div className="absolute inset-0 flex items-end gap-[3px] px-[2px]">
          {bins.map((n, i) => (
            <div
              key={i}
              className="flex-1 origin-bottom rounded-t-[3px] bg-cobalt"
              style={{
                height: `${Math.max(4, (n / peak) * 86)}%`,
                animation: `grow 0.6s ${i * 50}ms cubic-bezier(0.2,0.8,0.2,1) both`,
                opacity: n ? 1 : 0.25,
              }}
            />
          ))}
        </div>
        {item.askPrice != null && (
          <div className="absolute -top-4 bottom-0 w-0 animate-fade" style={{ left: `${pct(item.askPrice)}%` }}>
            <div className="absolute inset-y-0 w-[2px] -translate-x-1/2 bg-ink" />
            <PriceTag amount={item.askPrice} size="sm" tilt={0} className="absolute -top-2 right-1.5 whitespace-nowrap !text-[12px]" />
          </div>
        )}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10.5px] text-mute">
        <span>{eur(min)}</span>
        <span>{eur(Math.round((min + max) / 2))}</span>
        <span>{eur(max)}</span>
      </div>
      <div className="no-scrollbar -mr-3 mt-2.5 flex gap-2 overflow-x-auto pr-3">
        {comps.slice(0, 10).map((c, i) => <CompChip key={i} c={c} />)}
      </div>
    </div>
  );
}

function CompChip({ c }: { c: Comp }) {
  return (
    <a
      href={c.url}
      target="_blank"
      rel="noreferrer"
      className="flex w-[136px] shrink-0 flex-col gap-0.5 rounded-xl bg-paper px-2.5 py-2"
    >
      <span className="flex items-center gap-1.5 font-mono text-[13px] font-bold">
        <PlatformDot platform={c.platform} />
        {eur(c.price)}
      </span>
      <span className="line-clamp-2 text-[11.5px] leading-tight text-ink-2">{c.title}</span>
    </a>
  );
}
