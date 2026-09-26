"use client";

import { useEffect, useRef, useState } from "react";
import { eur } from "@/lib/format";
import type { Item } from "@/lib/types";
import { ListingPill, cx } from "./ui";

const COUNTDOWN = 10;

/** Screen 3: the finished ad, previewed per platform. The agent publishes it by
 *  itself; the countdown is informational. */
export function AdReady({ item }: { item: Item }) {
  const publishing = item.status === "publishing";
  const [left, setLeft] = useState(COUNTDOWN);

  useEffect(() => {
    if (publishing || left <= 0) return;
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left, publishing]);

  const going = publishing || left <= 0;
  const pills: Item["listings"] = item.listings.length ? item.listings : [{ platform: "marktplaats", status: "pending" }];

  return (
    <div className="space-y-4">
      <div className="px-1">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-mute">
          {going ? "Publishing" : "Ad ready"}
        </p>
        <h2 className="font-display text-[30px] font-extrabold leading-none tracking-[-0.04em]">
          {going ? "Going live…" : (
            <>Going live in <span className="tabular inline-block min-w-[1.25ch] text-center text-cobalt">{left}</span> s</>
          )}
        </h2>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
          <div
            className="h-full origin-left rounded-full bg-cobalt transition-transform duration-1000 ease-linear"
            style={{ transform: `scaleX(${going ? 1 : (COUNTDOWN - left + 1) / COUNTDOWN})` }}
          />
        </div>
      </div>

      <ListingPreviews item={item} />

      {going && (
        <div className="flex animate-fade flex-wrap gap-2">
          {pills.map((l) => <ListingPill key={l.platform} platform={l.platform} status={l.status} />)}
        </div>
      )}
    </div>
  );
}

/** Marktplaats- and eBay-flavoured previews of the same ad, swipeable. */
export function ListingPreviews({ item }: { item: Item }) {
  const ref = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  return (
    <div>
      <div
        ref={ref}
        onScroll={(e) => {
          const el = e.currentTarget;
          setPage(Math.round(el.scrollLeft / (el.scrollWidth - el.clientWidth || 1)));
        }}
        className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 pb-1"
      >
        <MarktplaatsPreview item={item} />
        <EbayPreview item={item} />
      </div>
      <div className="mt-3 flex items-center justify-center gap-4 text-[12.5px] font-semibold">
        {["Marktplaats", "eBay"].map((p, i) => (
          <button
            key={p}
            onClick={() => ref.current?.scrollTo({ left: i * ref.current.scrollWidth, behavior: "smooth" })}
            className={cx("flex items-center gap-1.5 transition-colors", page === i ? "text-ink" : "text-mute")}
          >
            <span className={cx("h-1.5 rounded-full transition-all duration-300", page === i ? "w-5 bg-ink" : "w-1.5 bg-line")} />
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function Photo({ item, className }: { item: Item; className?: string }) {
  const n = item.photos.length;
  return (
    <div className={cx("relative overflow-hidden bg-paper", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {item.photos[0] && <img src={item.photos[0]} alt="" className="size-full object-cover" />}
      {n > 0 && (
        <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-white">
          1/{n}
        </span>
      )}
    </div>
  );
}

function MarktplaatsPreview({ item }: { item: Item }) {
  const price = item.askPrice != null ? `€ ${item.askPrice.toFixed(2).replace(".", ",")}` : "—";
  return (
    <article className="w-[88%] shrink-0 snap-start overflow-hidden rounded-[22px] bg-white text-[#2d3c4d] shadow-[0_1px_0_#dadde4,0_12px_30px_-18px_rgba(11,13,18,0.35)]">
      <div className="flex items-center gap-2 border-b border-[#eceae6] px-4 py-2.5">
        <span className="size-3 rounded-[3px] bg-[#f59a23]" />
        <span className="text-[13px] font-bold tracking-[-0.01em]">Marktplaats</span>
        <span className="ml-auto text-[11px] text-[#8c96a3]">Preview</span>
      </div>
      <Photo item={item} className="aspect-[16/11]" />
      <div className="space-y-2 px-4 pb-4 pt-3">
        <h3 className="text-[17px] font-bold leading-snug">{item.title}</h3>
        <div className="flex items-center gap-2">
          <span className="text-[22px] font-bold">{price}</span>
          <span className="rounded bg-[#eaf1f9] px-1.5 py-0.5 text-[11px] font-semibold text-[#2e6ab3]">Bidding allowed</span>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11.5px]">
          {[item.condition?.split(" —")[0] ?? "Used", "Pickup or shipping", "Amsterdam"].map((t) => (
            <span key={t} className="rounded-full bg-[#f3f2ef] px-2 py-0.5">{t}</span>
          ))}
        </div>
        <p className="line-clamp-3 whitespace-pre-line text-[13.5px] leading-relaxed text-[#4d5b6b]">{item.description}</p>
        <div className="flex gap-2 pt-1">
          <span className="flex-1 rounded-lg bg-[#2e6ab3] py-2 text-center text-[13px] font-semibold text-white">Message</span>
          <span className="flex-1 rounded-lg border border-[#2e6ab3] py-2 text-center text-[13px] font-semibold text-[#2e6ab3]">Place bid</span>
        </div>
      </div>
    </article>
  );
}

function EbayPreview({ item }: { item: Item }) {
  return (
    <article className="w-[88%] shrink-0 snap-start overflow-hidden rounded-[22px] bg-white text-[#191919] shadow-[0_1px_0_#dadde4,0_12px_30px_-18px_rgba(11,13,18,0.35)]">
      <div className="flex items-center gap-2 border-b border-[#e5e5e5] px-4 py-2.5">
        <span className="flex gap-[2px]">
          {["#e53238", "#0064d2", "#f5af02", "#86b817"].map((c) => <span key={c} className="size-1.5 rounded-full" style={{ background: c }} />)}
        </span>
        <span className="text-[13px] font-bold tracking-[-0.01em]">eBay</span>
        <span className="ml-auto text-[11px] text-[#707070]">Preview</span>
      </div>
      <Photo item={item} className="aspect-[16/11]" />
      <div className="space-y-2 px-4 pb-4 pt-3">
        <h3 className="text-[16px] leading-snug">{item.title}</h3>
        <p className="text-[12.5px] text-[#707070]">Pre-owned · {item.category?.split(" › ").at(-1) ?? "Other"}</p>
        <div>
          <p className="text-[22px] font-bold">EUR {item.askPrice != null ? item.askPrice.toFixed(2) : "—"}</p>
          <p className="text-[12.5px] text-[#707070]">or Best Offer · Collection in person, or postage {eur(13.95)}</p>
        </div>
        <p className="line-clamp-2 whitespace-pre-line text-[13px] leading-relaxed text-[#555]">{item.description}</p>
        <div className="space-y-1.5 pt-1">
          <span className="block rounded-full bg-[#3665f3] py-2 text-center text-[13px] font-bold text-white">Buy It Now</span>
          <span className="block rounded-full border border-[#3665f3] py-2 text-center text-[13px] font-bold text-[#3665f3]">Make offer</span>
        </div>
      </div>
    </article>
  );
}
