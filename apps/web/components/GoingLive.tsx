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
      <div>
        <p className="text-[13px] font-semibold text-moss">{state === "live" ? "Done" : "Publishing"}</p>
        <h2 className="text-[26px] font-extrabold leading-tight tracking-[-0.02em]">
          {state === "live" ? <>It&apos;s <span className="marker">online</span></> : "Putting it online"}
        </h2>
      </div>

      <section>
        <Eyebrow className="mb-2.5">Live on</Eyebrow>
        <ul className="overflow-hidden rounded-[20px] bg-card shadow-soft">
          <li className="border-b border-line px-4 py-3.5">
            <div className="flex items-center gap-3">
              <PlatformLogo platform="marktplaats" className="!size-[34px]" />
              <div className="min-w-0 flex-1">
                <b className="block font-bold">Marktplaats</b>
                {state === "live" && mp?.url ? (
                  <a href={mp.url} target="_blank" rel="noreferrer" className="block truncate text-[13px] font-semibold text-ink underline underline-offset-2">
                    View on Marktplaats ↗
                  </a>
                ) : (
                  <span className="block text-[13px] text-moss">
                    {{ queued: "Waiting its turn", posting: "Poof is posting your ad", live: "Your ad is live", error: "Posting failed" }[state]}
                  </span>
                )}
              </div>
              <AgentStatus state={state} />
            </div>
            {state === "posting" && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
                <div className="h-full w-1/3 rounded-full bg-lime [animation:posting_1.3s_ease-in-out_infinite]" />
              </div>
            )}
          </li>
          {(["ebay", "vinted", "facebook"] as const).map((p) => (
            <li key={p} className="flex items-center gap-3 border-b border-line px-4 py-3.5 text-moss last:border-0">
              <PlatformLogo platform={p} muted className="!size-[34px]" />
              <div className="min-w-0 flex-1">
                <b className="block font-bold">{{ vinted: "Vinted", ebay: "eBay", facebook: "Facebook" }[p]}</b>
                <span className="block text-[13px]">Not connected yet</span>
              </div>
              <Soon />
            </li>
          ))}
        </ul>
      </section>

      <ListingPreviews item={item} />

      <p className="flex items-center justify-center gap-2 rounded-[16px] bg-limetint px-4 py-3.5 text-center text-[14px] font-bold">
        <span className="size-1.5 animate-blink rounded-full bg-ink" />
        You can close the app. Poof keeps going.
      </p>
    </div>
  );
}

function AgentStatus({ state }: { state: "queued" | "posting" | "live" | "error" }) {
  return (
    <span
      className={cx(
        "inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold",
        state === "live" && "bg-lime text-ink",
        state === "posting" && "bg-limetint text-ink",
        state === "queued" && "bg-card text-ink shadow-soft",
        state === "error" && "bg-alert-soft text-alert",
      )}
    >
      {state === "live" && <><Tick className="size-3.5" /> Live</>}
      {state === "posting" && <><span className="size-3 animate-spin rounded-full border-2 border-ink/20 border-t-ink" /> Posting</>}
      {state === "queued" && "Queued"}
      {state === "error" && "Failed"}
    </span>
  );
}
