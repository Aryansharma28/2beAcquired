"use client";

import { useState } from "react";
import { eur } from "@/lib/format";
import { coverFirst } from "@/lib/useItem";
import type { Item } from "@/lib/types";
import { RangeBar } from "./Wizard";
import { Eyebrow, PlatformLogo, PriceTag, Sheet, Tick, cx } from "./ui";

/** Cover photo with the scanning sweep. */
export function ScanPhoto({ item, scanning, className }: { item: Item; scanning: boolean; className?: string }) {
  const photo = coverFirst(item)[0];
  return (
    <div className={cx("relative overflow-hidden rounded-[28px] bg-ink", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photo && <img src={photo} alt="" className="size-full object-cover" />}
      {scanning && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(43,59,255,0.10)_1px,transparent_1px),linear-gradient(90deg,rgba(43,59,255,0.10)_1px,transparent_1px)] bg-[size:28px_28px]" />
          <div className="pointer-events-none absolute inset-x-0 h-24 -translate-y-full animate-scan bg-gradient-to-b from-transparent to-cobalt/45">
            <div className="absolute inset-x-0 bottom-0 h-[2px] bg-white shadow-[0_0_12px_2px_rgba(43,59,255,0.9)]" />
          </div>
        </>
      )}
    </div>
  );
}

/** Recognizing: "Looking at your photos…" with the agent's steps as they land. */
export function Looking({ item }: { item: Item }) {
  const name = item.recognition?.name;
  return (
    <div className="space-y-4">
      <div className="relative">
        <ScanPhoto item={item} scanning className="aspect-[4/3.4]" />
        {name && (
          <div className="absolute inset-x-3 bottom-3 animate-pop rounded-2xl bg-card/95 px-3.5 py-2 text-ink shadow-lg backdrop-blur">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-cobalt">Looks like</p>
            <p className="font-display text-[20px] font-bold leading-tight tracking-[-0.02em]">{name}</p>
          </div>
        )}
      </div>
      <div className="px-1">
        <h2 className="font-display text-[30px] font-extrabold leading-none tracking-[-0.04em]">Looking at your photos…</h2>
        <p className="mt-1.5 text-[15px] text-ink-2">About a minute. Then two quick questions.</p>
      </div>
      <ol className="space-y-1 rounded-[26px] bg-card p-2 shadow-soft">
        {item.events.map((e, i) => (
          <li key={`${e.ts}-${i}`} className="flex animate-rise items-start gap-3 rounded-2xl px-3 py-2">
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-cobalt text-white"><Tick className="size-3.5" /></span>
            <p className="text-[15px] font-medium leading-snug">{e.text}</p>
          </li>
        ))}
        <li className="flex items-center gap-3 px-3 py-2.5">
          <Running />
          <span className="skeleton h-3.5 w-2/3 rounded-full" />
        </li>
      </ol>
    </div>
  );
}

function Running() {
  return (
    <span className="relative grid size-6 shrink-0 place-items-center">
      <span className="absolute size-6 animate-ping rounded-full bg-cobalt/30" />
      <span className="size-2.5 rounded-full bg-cobalt" />
    </span>
  );
}

type StepState = "done" | "running" | "next";
type Step = { key: string; text: string; state: StepState; action?: { label: string; onClick: () => void } };

/** 06 · Your agent is on it. */
export function Writing({ item }: { item: Item }) {
  const [comps, setComps] = useState(false);
  const has = (re: RegExp) => item.events.some((e) => re.test(e.text));
  const n = item.compsCount ?? item.comps?.length ?? 0;
  const done = [
    !!item.recognition?.name || has(/lens|recogni/i),
    n > 0,
    item.askPrice != null,
    item.status === "ad_ready" || !!item.description,
  ];
  const firstOpen = done.findIndex((d) => !d);
  const state = (i: number): StepState => (done[i] ? "done" : i === firstOpen ? "running" : "next");
  const steps: Step[] = [
    { key: "rec", text: item.recognition?.name ? `Recognised: ${item.recognition.name}` : "Item recognised", state: state(0) },
    {
      key: "comps", text: n ? `${n} similar listings found` : "Finding similar listings", state: state(1),
      action: item.comps?.length ? { label: "See them", onClick: () => setComps(true) } : undefined,
    },
    {
      key: "price",
      text: item.askPrice != null
        ? `Price: start at ${eur(item.askPrice)}, never below ${eur(item.floorPrice)}`
        : `Pricing it, never below ${eur(item.floorPrice)}`,
      state: state(2),
    },
    { key: "ad", text: "Writing your ad", state: state(3) },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 px-1">
        <ScanPhoto item={item} scanning className="size-[84px] shrink-0 !rounded-[22px]" />
        <div>
          <Eyebrow>Setting up</Eyebrow>
          <h2 className="font-display text-[30px] font-extrabold leading-[0.95] tracking-[-0.04em]">Your agent is on it</h2>
        </div>
      </div>

      <ol className="rounded-[28px] bg-card p-2 shadow-soft">
        {steps.map((s) => (
          <li key={s.key} className={cx("flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors", s.state === "running" && "bg-cobalt-soft/60")}>
            {s.state === "done" && <span className="grid size-7 shrink-0 animate-pop place-items-center rounded-full bg-cobalt text-white"><Tick className="size-4" /></span>}
            {s.state === "running" && (
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-card text-cobalt ring-2 ring-cobalt">
                <svg viewBox="0 0 24 24" className="size-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M20 12a8 8 0 11-3-6.2" /><path d="M20 4v4h-4" /></svg>
              </span>
            )}
            {s.state === "next" && <span className="size-7 shrink-0 rounded-full border-2 border-dashed border-line" />}
            <span className={cx("min-w-0 flex-1 text-[15.5px] leading-snug", s.state === "next" ? "text-mute" : "font-semibold", s.key === "price" && s.state === "done" && "font-bold")}>
              {s.text}
            </span>
            {s.action && (
              <button onClick={s.action.onClick} className="shrink-0 rounded-full bg-paper px-3 py-1 text-[13px] font-semibold text-cobalt">
                {s.action.label}
              </button>
            )}
          </li>
        ))}
      </ol>

      <p className="flex items-center justify-center gap-2 text-[14px] text-mute">
        <span className="size-1.5 animate-blink rounded-full bg-cobalt" /> About 20 seconds
      </p>

      {item.priceRange && (
        <div className="animate-rise rounded-[24px] bg-card px-4 pb-3 pt-4 shadow-soft">
          <Eyebrow>The market</Eyebrow>
          <p className="mt-1 text-[15px] text-ink-2">
            Similar ones sell for <b className="font-mono text-ink">{eur(item.priceRange.low)}</b> to <b className="font-mono text-ink">{eur(item.priceRange.high)}</b>
          </p>
          <RangeBar
            low={item.priceRange.low} high={item.priceRange.high}
            mark={item.askPrice ?? item.floorPrice ?? item.priceRange.low}
            markLabel={item.askPrice != null ? `start ${eur(item.askPrice)}` : "your minimum"}
          />
        </div>
      )}

      <CompsSheet item={item} open={comps} onClose={() => setComps(false)} />
    </div>
  );
}

export function CompsSheet({ item, open, onClose }: { item: Item; open: boolean; onClose: () => void }) {
  const comps = [...(item.comps ?? [])].sort((a, b) => a.price - b.price);
  const n = item.compsCount ?? comps.length;
  return (
    <Sheet open={open} onClose={onClose} title={`${n} similar listings`}>
      {item.priceRange && (
        <p className="-mt-1 mb-3 text-[14px] text-ink-2">
          Most sell for <b className="font-mono">{eur(item.priceRange.low)}</b> to <b className="font-mono">{eur(item.priceRange.high)}</b>
          {comps.length < n && <> · showing {comps.length}</>}
        </p>
      )}
      <ul className="space-y-2">
        {comps.map((c, i) => (
          <li key={i}>
            <a href={c.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl bg-card px-3 py-2.5 shadow-soft">
              <PlatformLogo platform={c.platform ?? "marktplaats"} />
              <span className="min-w-0 flex-1 truncate text-[14.5px]">{c.title}</span>
              <PriceTag amount={c.price} size="sm" tilt={0} />
            </a>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
