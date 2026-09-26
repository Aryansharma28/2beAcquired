"use client";

import type { Item } from "@/lib/types";
import { ListingPreviews } from "./Previews";
import { Eyebrow, PlatformLogo, Soon, Tick, cx } from "./ui";

/** 08 · Going live. */
export function GoingLive({ item }: { item: Item }) {
  const mp = item.listings.find((l) => l.platform === "marktplaats");
  const state: "queued" | "posting" | "live" | "error" =
    mp?.status === "live" ? "live" : mp?.status === "error" ? "error" : mp ? "posting" : "queued";
  return (
    <div className="space-y-5">
      <div className="px-1">
        <Eyebrow>{state === "live" ? "Done" : "Publishing"}</Eyebrow>
        <h2 className="font-display text-[38px] font-extrabold leading-[0.95] tracking-[-0.045em]">
          {state === "live" ? "It's online" : "Putting it online"}
        </h2>
      </div>

      <ul className="overflow-hidden rounded-[26px] bg-card ring-1 ring-line/60">
        <li className="border-b border-line/70 px-4 py-4">
          <div className="flex items-center gap-3">
            <PlatformLogo platform="marktplaats" className="!size-8 !rounded-lg !text-[16px]" />
            <span className="flex-1 text-[16px] font-semibold">Marktplaats agent</span>
            <AgentStatus state={state} />
          </div>
          {state === "posting" && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full w-1/3 rounded-full bg-cobalt [animation:posting_1.3s_ease-in-out_infinite]" />
            </div>
          )}
          {state === "live" && mp?.url && (
            <a href={mp.url} target="_blank" rel="noreferrer" className="mt-2 block truncate pl-11 text-[13px] font-semibold text-cobalt">
              View on Marktplaats ↗
            </a>
          )}
        </li>
        {(["vinted", "ebay", "facebook"] as const).map((p) => (
          <li key={p} className="flex items-center gap-3 border-b border-line/70 px-4 py-3.5 text-mute last:border-0">
            <PlatformLogo platform={p} muted className="!size-8 !rounded-lg !text-[16px]" />
            <span className="flex-1 text-[15px] font-semibold">{{ vinted: "Vinted", ebay: "eBay", facebook: "Facebook" }[p]} agent</span>
            <Soon />
          </li>
        ))}
      </ul>

      <ListingPreviews item={item} />

      <p className="flex items-center justify-center gap-2 rounded-[20px] bg-ink px-4 py-3.5 text-center text-[14.5px] font-semibold text-white">
        <span className="size-1.5 animate-blink rounded-full bg-tag" />
        You can close the app. Your agent keeps going.
      </p>
    </div>
  );
}

function AgentStatus({ state }: { state: "queued" | "posting" | "live" | "error" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-bold",
        state === "live" && "bg-go-soft text-go",
        state === "posting" && "bg-cobalt-soft text-cobalt-deep",
        state === "queued" && "bg-paper text-mute",
        state === "error" && "bg-alert-soft text-alert",
      )}
    >
      {state === "live" && <><Tick className="size-3.5" /> Live</>}
      {state === "posting" && <><span className="size-3 animate-spin rounded-full border-2 border-cobalt/25 border-t-cobalt" /> Posting</>}
      {state === "queued" && "Queued"}
      {state === "error" && "Failed"}
    </span>
  );
}
