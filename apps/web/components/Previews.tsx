"use client";

import { coverFirst } from "@/lib/useItem";
import type { Item } from "@/lib/types";
import { cx } from "./ui";

/** How the ad looks on Marktplaats (the only platform Poof posts to). */
export function ListingPreviews({ item }: { item: Item }) {
  return <MarktplaatsPreview item={item} />;
}

function Photo({ item, className }: { item: Item; className?: string }) {
  const photos = coverFirst(item);
  return (
    <div className={cx("relative overflow-hidden bg-paper", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photos[0] && <img src={photos[0]} alt="" className="size-full object-cover" />}
      {photos.length > 0 && (
        <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-white">
          1/{photos.length}
        </span>
      )}
    </div>
  );
}

const CONDITION_LABEL: Record<string, string> = {
  Nieuw: "Nieuw", "Zo goed als nieuw": "Zo goed als nieuw", Gebruikt: "Gebruikt", "Niet werkend": "Niet werkend",
};

function MarktplaatsPreview({ item }: { item: Item }) {
  const price = item.askPrice != null ? `€ ${item.askPrice.toFixed(2).replace(".", ",")}` : "—";
  return (
    <article className="w-full overflow-hidden rounded-[22px] bg-white text-[#2d3c4d] shadow-[0_1px_0_#dadde4,0_12px_30px_-18px_rgba(11,13,18,0.35)]">
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
          <span className="rounded bg-[#eaf1f9] px-1.5 py-0.5 text-[11px] font-semibold text-[#2e6ab3]">Bieden</span>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11.5px]">
          {[CONDITION_LABEL[item.condition ?? ""] ?? item.condition ?? "Gebruikt", "Ophalen", item.pickupCity ?? "Amsterdam"].map((t) => (
            <span key={t} className="rounded-full bg-[#f3f2ef] px-2 py-0.5">{t}</span>
          ))}
        </div>
        <p className="line-clamp-3 whitespace-pre-line text-[13.5px] leading-relaxed text-[#4d5b6b]">{item.description}</p>
        <div className="flex gap-2 pt-1">
          <span className="flex-1 rounded-lg bg-[#2e6ab3] py-2 text-center text-[13px] font-semibold text-white">Bericht</span>
          <span className="flex-1 rounded-lg border border-[#2e6ab3] py-2 text-center text-[13px] font-semibold text-[#2e6ab3]">Bied</span>
        </div>
      </div>
    </article>
  );
}
