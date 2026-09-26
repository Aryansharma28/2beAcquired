"use client";

import { useState } from "react";
import { eur } from "@/lib/format";
import { coverFirst } from "@/lib/useItem";
import type { Item } from "@/lib/types";
import { RangeBar } from "./Wizard";
import { Eyebrow, PlatformLogo, PoofTag, PriceTag, Sheet, Tick, cx } from "./ui";

/** Cover photo with the scanning sweep. */
export function ScanPhoto({ item, scanning, className }: { item: Item; scanning: boolean; className?: string }) {
  const photo = coverFirst(item)[0];
  return (
    <div className={cx("relative overflow-hidden rounded-[20px] bg-limetint", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photo && <img src={photo} alt="" className="size-full object-cover" />}
      {scanning && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(215,245,122,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(215,245,122,0.16)_1px,transparent_1px)] bg-[size:28px_28px]" />
          <div className="pointer-events-none absolute inset-x-0 h-24 -translate-y-full animate-scan bg-gradient-to-b from-transparent to-lime/50">
            <div className="absolute inset-x-0 bottom-0 h-[2px] bg-lime shadow-[0_0_12px_2px_rgba(215,245,122,0.9)]" />
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
          <div className="absolute inset-x-3 bottom-3 animate-pop rounded-[16px] bg-card px-3.5 py-2.5 text-ink shadow-float">
            <p className="flex items-center gap-2 text-[12px] font-bold text-moss"><PoofTag /> Looks like</p>
            <p className="mt-1 text-[20px] font-extrabold leading-tight tracking-[-0.02em]">{name}</p>
          </div>
        )}
      </div>
      <div>
        <h2 className="text-[26px] font-extrabold leading-tight tracking-[-0.02em]">Looking at your photos…</h2>
        <p className="mt-1 text-[15px] text-moss">About a minute. Then two quick questions.</p>
      </div>
      <ol className="overflow-hidden rounded-[20px] bg-card shadow-soft">
        {item.events.map((e, i) => (
          <li key={`${e.ts}-${i}`} className="flex animate-rise items-start gap-3 border-b border-line px-4 py-3.5">
            <span className="mt-px grid size-[26px] shrink-0 place-items-center rounded-full bg-ink text-white"><Tick className="size-3.5" /></span>
            <p className="text-[15px] font-semibold leading-snug">{e.text}</p>
          </li>
        ))}
        <li className="flex items-center gap-3 bg-limetint px-4 py-3.5">
          <Running />
          <span className="skeleton h-3.5 w-2/3 rounded-full" />
        </li>
      </ol>
    </div>
  );
}

function Running() {
  return (
    <span className="relative grid size-[26px] shrink-0 place-items-center">
      <span className="absolute size-[26px] animate-ping rounded-full bg-lime/60" />
      <span className="size-[26px] rounded-full bg-lime" />
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
      <div className="flex items-center gap-4 pt-6">
        <ScanPhoto item={item} scanning className="sticker size-[72px] shrink-0 !rounded-[12px]" />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-moss">{item.recognition?.name ?? "Setting up"}</p>
          <h2 className="text-[26px] font-extrabold leading-tight tracking-[-0.02em]">Poof is on it</h2>
        </div>
      </div>

      <ol className="overflow-hidden rounded-[20px] bg-card shadow-soft">
        {steps.map((s) => (
          <li key={s.key} className={cx("flex items-center gap-3 border-b border-line px-4 py-3.5 transition-colors last:border-0", s.state === "running" && "rounded-[16px] border-transparent bg-limetint")}>
            {s.state === "done" && <span className="grid size-[26px] shrink-0 animate-pop place-items-center rounded-full bg-ink text-white"><Tick className="size-3.5" /></span>}
            {s.state === "running" && <span className="size-[26px] shrink-0 animate-blink rounded-full bg-lime" />}
            {s.state === "next" && <span className="size-[26px] shrink-0 rounded-full bg-line" />}
            <span className={cx("min-w-0 flex-1 text-[15px] font-bold leading-snug", s.state === "next" && "font-semibold text-moss")}>
              {s.text}
            </span>
            {s.action && (
              <button onClick={s.action.onClick} className="h-[34px] shrink-0 rounded-full border border-ink px-3.5 text-[13px] font-bold text-ink">
                {s.action.label}
              </button>
            )}
          </li>
        ))}
      </ol>

      <p className="flex items-center justify-center gap-2 text-[13px] font-semibold text-moss">
        <span className="size-1.5 animate-blink rounded-full bg-ink" /> About 20 seconds
      </p>

      {item.priceRange && (
        <div className="animate-rise rounded-[20px] bg-card px-4 pb-3 pt-4 shadow-soft">
          <Eyebrow>The market</Eyebrow>
          <p className="mt-1 text-[15px] text-moss">
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
        <p className="-mt-1 mb-3 text-[14px] text-moss">
          Most sell for <b className="font-mono">{eur(item.priceRange.low)}</b> to <b className="font-mono">{eur(item.priceRange.high)}</b>
          {comps.length < n && <> · showing {comps.length}</>}
        </p>
      )}
      <ul className="space-y-2">
        {comps.map((c, i) => (
          <li key={i}>
            <a href={c.url} target="_blank" rel="noreferrer" className="flex min-h-[52px] items-center gap-3 rounded-[16px] bg-card px-3.5 py-2.5 shadow-soft">
              <PlatformLogo platform={c.platform ?? "marktplaats"} className="!size-7" />
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{c.title}</span>
              <PriceTag amount={c.price} size="sm" tilt={0} />
            </a>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
