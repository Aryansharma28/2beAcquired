"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useItem, coverFirst } from "@/lib/useItem";
import { approve } from "@/lib/api";
import { eur } from "@/lib/format";
import type { Item, Status } from "@/lib/types";
import { AdReview } from "@/components/AdReview";
import { AgentLog } from "@/components/AgentLog";
import { GoingLive } from "@/components/GoingLive";
import { NeedsConnection } from "@/components/NeedsConnection";
import { Overview } from "@/components/Overview";
import { Looking, Writing } from "@/components/Setup";
import { Sold } from "@/components/Sold";
import { Wizard } from "@/components/Wizard";
import { BackButton, Button, Eyebrow, ICON_BTN, NavBar, PriceTag } from "@/components/ui";

type Screen = "looking" | "wizard" | "writing" | "ad" | "connect" | "going" | "overview" | "sold" | "error";

function screenFor(s: Status): Screen {
  switch (s) {
    case "recognizing": case "analyzing": return "looking";
    case "needs_details": return "wizard";
    case "writing": return "writing";
    case "ad_ready": return "ad";
    case "needs_connection": return "connect";
    case "publishing": return "going";
    case "live": case "negotiating": case "needs_you": return "overview";
    case "deal": case "pickup_scheduled": case "sold": case "delisted": return "sold";
    default: return "error";
  }
}

const TITLE: Partial<Record<Screen, string>> = {
  looking: "New ad", writing: "New ad", ad: "New ad", connect: "New ad", going: "New ad", overview: "How this ad is going", error: "Ad",
};

export default function ItemPage() {
  const { id } = useParams<{ id: string }>();
  const { item: server, error } = useItem(id);

  // Optimistic step after /details or /approve, dropped once the server moves on.
  const [patch, setPatch] = useState<{ from: Status; data: Partial<Item> } | null>(null);
  const item = server && patch && server.status === patch.from ? { ...server, ...patch.data } : server;

  // Keep 08 on screen briefly after the ad went live.
  const [holdGoing, setHoldGoing] = useState(false);
  const prev = useRef<Status | null>(null);
  useEffect(() => {
    const s = server?.status ?? null;
    if (prev.current === "publishing" && s && s !== "publishing" && screenFor(s) === "overview") {
      setHoldGoing(true);
      const t = setTimeout(() => setHoldGoing(false), 3500);
      prev.current = s;
      return () => clearTimeout(t);
    }
    prev.current = s;
  }, [server?.status]);

  const [overview, setOverview] = useState(false);
  let screen = item ? screenFor(item.status) : null;
  if (screen === "overview" && holdGoing) screen = "going";
  if (screen === "sold" && overview) screen = "overview";

  const last = useRef(screen);
  useEffect(() => {
    if (screen && last.current && screen !== last.current) window.scrollTo({ top: 0, behavior: "smooth" });
    last.current = screen;
  }, [screen]);

  const nav = screen === "overview" || screen === "sold";

  return (
    <main className={`flex flex-1 flex-col px-5 pt-[max(16px,env(safe-area-inset-top))] ${nav ? "pb-28" : "pb-10"} ${screen === "sold" ? "bg-limetint" : ""}`}>
      {screen !== "wizard" && (
        <header className="flex min-h-14 items-center gap-2.5 py-2">
          {screen === "overview" && overview ? (
            <button onClick={() => setOverview(false)} aria-label="Back" className={ICON_BTN}>
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
          ) : (
            <BackButton />
          )}
          <p className="truncate text-[17px] font-bold">{screen ? TITLE[screen] ?? "" : ""}</p>
        </header>
      )}

      {error && !item && (
        <div className="mt-8 rounded-[20px] bg-alert-soft p-5 text-alert">
          <p className="font-semibold">Can&apos;t load this ad.</p>
          <p className="mt-1 text-[14px]">{error}</p>
          <Button href="/" variant="ghost" className="mt-4">Back to your ads</Button>
        </div>
      )}

      {!item && !error && (
        <div className="mt-4 space-y-4">
          <div className="skeleton aspect-[4/3] rounded-[20px]" />
          <div className="skeleton h-40 rounded-[20px]" />
        </div>
      )}

      {item && screen && (
        <div key={screen} className="flex-1 animate-fade pt-2">
          {screen === "looking" && <Looking item={item} />}
          {screen === "wizard" && <Wizard item={item} onSubmitted={(data) => setPatch({ from: item.status, data })} />}
          {screen === "writing" && <Writing item={item} />}
          {screen === "ad" && <AdReview item={item} onApproved={(data) => setPatch({ from: item.status, data })} />}
          {screen === "connect" && <NeedsConnection item={item} onApproved={(data) => setPatch({ from: item.status, data })} />}
          {screen === "going" && <GoingLive item={item} />}
          {screen === "overview" && <Overview item={item} />}
          {screen === "sold" && <Sold item={item} onOverview={() => { setOverview(true); window.scrollTo({ top: 0 }); }} />}
          {screen === "error" && <ErrorCard item={item} onRetry={() => setPatch({ from: item.status, data: { status: "publishing" } })} />}
        </div>
      )}

      {nav && <NavBar />}
    </main>
  );
}

function ErrorCard({ item, onRetry }: { item: Item; onRetry: () => void }) {
  const last = item.events.filter((e) => e.type === "error").at(-1);
  const photo = coverFirst(item)[0];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const loginIssue = /login|log in|session/i.test(last?.text ?? "");
  // Only an ad that was written can be retried (publishing failed); earlier failures need a new photo.
  const canRetry = !!item.title;
  const retry = async () => {
    setBusy(true); setErr(null);
    try { await approve({ itemId: item.id }); onRetry(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not retry"); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <div className="rounded-[20px] bg-card p-5 shadow-soft">
        <p className="flex items-center gap-2 text-[13px] font-bold text-alert">
          <span className="grid size-5 place-items-center rounded-full bg-alert text-[12px] font-extrabold text-white">!</span> Problem
        </p>
        <p className="mt-2 text-[24px] font-extrabold leading-tight tracking-[-0.02em]">Poof hit a problem</p>
        <p className="mt-1.5 text-[15px] font-medium text-alert">{last?.text ?? "No details were logged. Check the activity log below."}</p>
        {loginIssue && <p className="mt-2 text-[14px] text-moss">Open the poof Connector on your laptop while logged in to Marktplaats, then try again.</p>}
        {canRetry ? (
          <Button onClick={retry} disabled={busy} variant="ink" className="mt-4 w-full">{busy ? "Trying again…" : "Try again"}</Button>
        ) : (
          <Button href="/new" variant="ink" className="mt-4 w-full">Start over with a new photo</Button>
        )}
        {err && <p className="mt-2 text-[13.5px] text-alert">{err}</p>}
      </div>
      <section>
        <Eyebrow className="mb-2">The ad so far</Eyebrow>
        <div className="overflow-hidden rounded-[20px] bg-card shadow-soft">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {photo && <img src={photo} alt="" className="aspect-[16/10] w-full object-cover" />}
          <div className="space-y-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[18px] font-extrabold leading-tight">{item.title ?? item.recognition?.name ?? "Not recognised yet"}</p>
              {item.askPrice != null && <PriceTag amount={item.askPrice} size="sm" />}
            </div>
            {item.floorPrice != null && <p className="text-[13.5px] text-mute">Minimum {eur(item.floorPrice)}</p>}
            {item.description && <p className="line-clamp-4 whitespace-pre-line text-[14.5px] text-ink-2">{item.description}</p>}
          </div>
        </div>
      </section>
      <section>
        <Eyebrow className="mb-2">Activity log</Eyebrow>
        <AgentLog item={item} />
      </section>
    </div>
  );
}
