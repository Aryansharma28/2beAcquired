"use client";

import { useEffect, useState } from "react";
import { PLATFORM, eur, pickupWhen, recapOf } from "@/lib/format";
import { coverFirst } from "@/lib/useItem";
import type { Item, Pickup, Platform } from "@/lib/types";
import { Thread } from "./Chats";
import { Button, Eyebrow, PlatformLogo, Tick, cx } from "./ui";

type Phase = "sticker" | "poof" | "done";

/** Whether this item's sold moment already played in this tab (so going back and forth doesn't replay it). */
function firstPhase(id: string): Phase {
  if (typeof window === "undefined") return "sticker";
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "done";
    if (sessionStorage.getItem(`poof:sold:${id}`)) return "done";
  } catch { /* storage blocked: just play it */ }
  return "sticker";
}

function play(src: string, volume: number) {
  try {
    const a = new Audio(src);
    a.volume = volume;
    a.play().catch(() => {});
  } catch { /* no audio: fine */ }
}

/** 14 · Sold. While status is deal / pickup_scheduled it's the
 *  "Sold, pickup planned" variant; at `sold` everything is wrapped up.
 *  The ad photo poofs away (sprite + sound from the waitlist page), then the result shows. */
export function Sold({ item, onOverview }: { item: Item; onOverview: () => void }) {
  const sale = item.sale;
  const [now] = useState(() => Date.now());
  const done = item.status === "sold" || item.status === "delisted";
  const conv = item.conversations.find((c) => c.state === "deal" || c.state === "pickup_scheduled");
  const buyer = (sale?.buyer ?? item.pickup?.buyer ?? conv?.buyer)?.split(" ")[0];
  // Only platforms we really listed on.
  const platforms: Platform[] = item.listings.length ? [...new Set(item.listings.map((l) => l.platform))] : ["marktplaats"];
  const recap = recapOf(item);
  const photo = coverFirst(item)[0];

  const [phase, setPhase] = useState<Phase>(() => firstPhase(item.id));
  useEffect(() => {
    if (phase !== "sticker") return;
    const t1 = setTimeout(() => { setPhase("poof"); play("/brand/poof-item.mp3", 0.5); }, 450);
    const t2 = setTimeout(() => {
      setPhase("done");
      play("/brand/poof-success.mp3", 0.6);
      try { sessionStorage.setItem(`poof:sold:${item.id}`, "1"); } catch { /* ignore */ }
    }, 1300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // Runs once per mount: the phase only moves forward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = phase === "done";

  return (
    <div className="-mx-5 -mt-2">
      {/* The poof stage */}
      <div className="relative flex h-[280px] items-center justify-center overflow-hidden">
        {phase !== "done" && photo && (
          <div
            className={cx("sticker w-[52%] max-w-[210px] overflow-hidden rounded-[12px] transition-[transform,opacity] duration-300 ease-in",
              phase === "poof" && "!scale-0 opacity-0")}
            style={{ ["--tilt" as string]: "-3deg" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="" className="aspect-square w-full object-cover" />
          </div>
        )}
        {phase === "poof" && <span className="poof-fx absolute left-1/2 top-1/2 size-[260px] -translate-x-1/2 -translate-y-1/2" aria-hidden />}

        <div className={cx("absolute inset-x-0 px-6 text-center transition-opacity duration-500", shown ? "opacity-100" : "opacity-0")} aria-live="polite">
          <h2 className="text-[32px] font-extrabold leading-[1.15] tracking-[-0.02em]">
            {done ? <><span className="marker">Sold</span> for {eur(sale?.price)}</> : <><span className="marker">Sold</span>, pickup planned</>}
          </h2>
          <p className="mt-2 text-[15px] text-moss">
            {done
              ? [buyer && `to ${buyer}`, sale && `on ${PLATFORM[sale.platform]}`].filter(Boolean).join(" ")
              : [`Deal at ${eur(sale?.price)}`, buyer, sale && PLATFORM[sale.platform]].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      {/* Next panel */}
      <div className={cx("relative -mb-28 min-h-[60dvh] rounded-t-[28px] bg-card px-5 pb-36 pt-5 shadow-float transition-transform duration-500", shown ? "translate-y-0" : "translate-y-3")}>
        {item.pickup && (
          <section>
            <Eyebrow className="mb-2.5">Next</Eyebrow>
            <PickupCard pickup={item.pickup} done={new Date(item.pickup.end).getTime() < now} light />
          </section>
        )}

        <div className={cx("rounded-[20px] bg-card px-4 py-1 shadow-soft", item.pickup && "mt-3")}>
          {[
            ["Time to sell", recap.duration],
            ["Messages handled", String(recap.messages)],
            ["Counter offers", String(recap.counters)],
          ].map(([k, v]) => (
            <div key={k} className="flex min-h-11 items-center justify-between border-b border-line last:border-0">
              <span>{k}</span>
              <b className="font-bold tabular">{v}</b>
            </div>
          ))}
        </div>

        <Eyebrow className="mb-2.5 mt-[22px]">Removed from</Eyebrow>
        <ul className="flex flex-wrap gap-2">
          {platforms.map((p, i) => {
            const gone = item.listings.find((l) => l.platform === p)?.status === "removed";
            return (
              <li key={p} className="inline-flex items-center gap-2 rounded-full bg-page py-1 pl-1 pr-3 text-[13px] font-semibold">
                <PlatformLogo platform={p} className="!size-6" />
                {gone ? <Tick className="size-3.5" delay={i * 120} /> : <span className="size-3 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />}
                {PLATFORM[p]}
                <span className="font-normal text-moss">{gone ? "ad taken down" : "taking the ad down…"}</span>
              </li>
            );
          })}
        </ul>

        <Button href="/new" className="mt-[18px] w-full">Sell something else</Button>
        <button onClick={onOverview} className="mt-1 min-h-11 w-full text-center text-[15px] font-semibold text-ink underline underline-offset-4">
          How this ad went
        </button>

        {conv && (
          <div className="mt-4">
            <div className="puff-line mb-3" />
            <Eyebrow className="mb-1">How Poof closed it</Eyebrow>
            <Thread c={conv} />
          </div>
        )}
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
        {pickup.calendarEventId && (
          <p className="mt-0.5 flex items-center gap-1 text-[12.5px] font-bold text-ink">
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>
            In your calendar
          </p>
        )}
      </div>
    </section>
  );
}
