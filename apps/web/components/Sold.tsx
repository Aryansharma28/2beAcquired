"use client";

import { useMemo, useState } from "react";
import { PLATFORM, eur, pickupWhen } from "@/lib/format";
import type { Item, Pickup, Platform } from "@/lib/types";
import { Thread } from "./ChatLive";
import { Button, PlatformDot, Tick, cx } from "./ui";

/** Screen 5: sold. While status is deal / pickup_scheduled it's the
 *  "Sold, pickup planned" variant; at `sold` everything is wrapped up. */
export function Sold({ item }: { item: Item }) {
  const sale = item.sale;
  const [now] = useState(() => Date.now());
  const done = item.status === "sold" || item.status === "delisted";
  const conv = item.conversations.find((c) => c.state === "deal" || c.state === "pickup_scheduled");
  const buyer = sale?.buyer ?? item.pickup?.buyer ?? conv?.buyer;
  const platforms: Platform[] = item.listings.length ? item.listings.map((l) => l.platform) : ["marktplaats"];
  const allGone = item.listings.length > 0 && item.listings.every((l) => l.status === "removed");

  const confetti = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: (i % 7) * 120,
        dur: 1800 + ((i * 53) % 1400),
        dx: `${((i * 29) % 80) - 40}px`,
        rot: `${(i * 97) % 720}deg`,
        color: ["#ffd84d", "#ffffff", "#0b0d12", "#ffd84d"][i % 4],
        w: 6 + (i % 3) * 3,
      })),
    [],
  );

  return (
    <div className="-mx-5 -mb-8">
      <div className="relative min-h-[calc(100dvh-170px)] overflow-hidden rounded-t-[36px] bg-cobalt px-6 pb-10 pt-4 text-white">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {confetti.map((c, i) => (
            <span
              key={i}
              className="absolute top-0 rounded-[2px]"
              style={{
                left: `${c.left}%`, width: c.w, height: c.w * 1.6, background: c.color,
                animation: `confetti ${c.dur}ms ${c.delay}ms cubic-bezier(0.25,0.6,0.4,1) both`,
                ["--dx" as string]: c.dx, ["--rot" as string]: c.rot,
              }}
            />
          ))}
        </div>

        {/* The swing tag, hanging on its string */}
        <div className="relative flex justify-center pt-1">
          <div className="flex origin-top animate-swing flex-col items-center">
            <span className="relative z-10 h-14 w-[2px] rounded-full bg-white/80" />
            <div className="-mt-[30px] drop-shadow-[0_18px_22px_rgba(0,0,0,0.35)]">
              <div
                className="relative flex w-[164px] flex-col items-center bg-tag px-4 pb-5 pt-11 text-ink"
                style={{ clipPath: "polygon(50% 0, 100% 16%, 100% 100%, 0 100%, 0 16%)", borderRadius: 6 }}
              >
                <span className="absolute top-5 size-4 rounded-full bg-cobalt shadow-[inset_0_1px_3px_rgba(0,0,0,0.35)]" />
                <span className="font-mono text-[13px] font-bold uppercase tracking-[0.3em]">Sold</span>
                <span className="tabular mt-1 font-mono text-[54px] font-bold leading-none tracking-[-0.05em]">{eur(sale?.price)}</span>
                <span className="mt-3 h-px w-full bg-ink/20" />
                <span className="mt-2 font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-ink/60">
                  asked {eur(item.askPrice)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative mt-6 animate-rise text-center [animation-delay:400ms]">
          <h2 className="font-display text-[44px] font-extrabold leading-[0.95] tracking-[-0.045em]">
            Sold for {eur(sale?.price)}
          </h2>
          <p className="mt-2 text-[16px] text-white/75">
            {done
              ? [buyer && `to ${buyer.split(" ")[0]}`, sale && `on ${PLATFORM[sale.platform]}`].filter(Boolean).join(" ")
              : ["Pickup planned", buyer?.split(" ")[0], sale && PLATFORM[sale.platform]].filter(Boolean).join(" · ")}
          </p>
        </div>

        {item.pickup && <PickupCard pickup={item.pickup} done={new Date(item.pickup.end).getTime() < now} />}

        <section className="relative mt-3 animate-rise rounded-3xl bg-white/10 p-4 backdrop-blur [animation-delay:700ms]">
          <p className="mb-3 font-display text-[17px] font-bold tracking-[-0.02em]">
            {allGone ? "Removed from every platform" : "Removing from every platform…"}
          </p>
          <ul className="space-y-2">
            {platforms.map((p, i) => {
              const gone = item.listings.find((l) => l.platform === p)?.status === "removed";
              return (
                <li key={p} className="flex items-center gap-3 rounded-2xl bg-white/10 px-3.5 py-2.5">
                  <PlatformDot platform={p} className="size-2.5 ring-2 ring-white/80" />
                  <span className="flex-1 text-[15px] font-semibold">{PLATFORM[p]}</span>
                  <span className={cx("grid size-7 place-items-center rounded-full transition-colors duration-500", gone ? "bg-tag text-ink" : "bg-white/15")}>
                    {gone ? <Tick className="size-4" delay={i * 120} /> : <span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <Button href="/new" variant="ghost" className="relative mt-5 w-full !bg-tag !py-4 !text-[17px] !text-ink !ring-0">
          Sell something else
        </Button>
      </div>

      {conv && (
        <div className="bg-cobalt">
          <div className="rounded-t-[28px] bg-paper px-5 pb-10 pt-5">
            <p className="mb-2.5 px-1 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-mute">How the agent closed it</p>
            <Thread c={conv} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Calendar-leaf pickup card: "Sat 3 Oct, 14:30 · Daan picks up · in your calendar". */
export function PickupCard({ pickup, done }: { pickup: Pickup; done?: boolean }) {
  const w = pickupWhen(pickup.start);
  const end = pickupWhen(pickup.end);
  const first = pickup.buyer.split(" ")[0];
  return (
    <section className="relative mt-6 flex animate-pop items-center gap-4 rounded-3xl bg-white p-3 pr-4 text-ink shadow-[0_18px_40px_-18px_rgba(0,0,0,0.5)] [animation-delay:550ms]">
      <div className="w-[64px] shrink-0 overflow-hidden rounded-2xl text-center ring-1 ring-line">
        <div className="bg-alert py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-white">{w.month}</div>
        <div className="font-display text-[30px] font-extrabold leading-[1.15] tracking-[-0.04em]">{w.date}</div>
        <div className="pb-1 text-[11px] font-semibold text-mute">{w.weekday}</div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-cobalt">
          {done ? "Picked up" : "Pickup"} · {w.day}
        </p>
        <p className="tabular font-display text-[21px] font-bold leading-tight tracking-[-0.02em]">
          {w.time}<span className="text-mute"> – {end.time}</span>
        </p>
        <p className="text-[13.5px] text-ink-2">{first} picks up</p>
        {pickup.calendarEventId && (
          <p className="mt-0.5 flex items-center gap-1 text-[12.5px] font-semibold text-go">
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>
            In your calendar
          </p>
        )}
      </div>
    </section>
  );
}
