"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useItem, coverFirst } from "@/lib/useItem";
import { approve, markDone } from "@/lib/api";
import {
  PLATFORM, daysSince, dealBuyer, dealConversation, dealPrice, dealStage, eur, handoverLabel, isPaid, paidOnline, recapOf,
} from "@/lib/format";
import type { Item, Status } from "@/lib/types";
import { AdReview } from "@/components/AdReview";
import { AgentLog } from "@/components/AgentLog";
import { BackIcon, ChatEntryRow, FoldedLowOffers, Ic, PlatIcon, TYPING, chatEntries } from "@/components/Chats";
import { GoingLive } from "@/components/GoingLive";
import { NeedsConnection } from "@/components/NeedsConnection";
import { Looking, Writing } from "@/components/Setup";
import { HANDOVER_DONE_LABEL, Sold, soldRevealed } from "@/components/Sold";
import { Wizard } from "@/components/Wizard";
import { BackButton, Button, Eyebrow, PriceTag } from "@/components/ui";

type Screen = "looking" | "wizard" | "writing" | "ad" | "connect" | "going" | "product" | "sold" | "error";

function screenFor(s: Status): Screen {
  switch (s) {
    case "recognizing": case "analyzing": return "looking";
    case "needs_details": return "wizard";
    case "writing": return "writing";
    case "ad_ready": return "ad";
    case "needs_connection": return "connect";
    case "publishing": return "going";
    case "live": case "negotiating": case "needs_you": return "product";
    case "deal": case "pickup_scheduled": case "sold": case "delisted": return "sold";
    default: return "error";
  }
}

const TITLE: Partial<Record<Screen, string>> = {
  looking: "New ad", writing: "New ad", ad: "New ad", connect: "New ad", error: "Ad",
};

export default function ItemPage() {
  const { id } = useParams<{ id: string }>();
  const { item: server, error, refresh } = useItem(id);

  // Optimistic step after /details or /approve, dropped once the server moves on.
  const [patch, setPatch] = useState<{ from: Status; data: Partial<Item> } | null>(null);
  const item = server && patch && server.status === patch.from ? { ...server, ...patch.data } : server;

  // Keep going-live on screen briefly after the ad went live.
  const [holdGoing, setHoldGoing] = useState(false);
  const prev = useRef<Status | null>(null);
  useEffect(() => {
    const s = server?.status ?? null;
    if (prev.current === "publishing" && s && s !== "publishing" && screenFor(s) === "product") {
      setHoldGoing(true);
      const t = setTimeout(() => setHoldGoing(false), 3500);
      prev.current = s;
      return () => clearTimeout(t);
    }
    prev.current = s;
  }, [server?.status]);

  // Closed ads: a pending deal opens on the sold moment (like the prototype's home tile); a finished sale
  // opens on the product page once its poof moment has played. "See the ad and all chats" / back switch views.
  const [view, setView] = useState<"auto" | "product" | "sold">("auto");
  let screen = item ? screenFor(item.status) : null;
  if (item && screen === "sold") {
    const stage = dealStage(item);
    if (view === "product") screen = "product";
    else if (view === "auto" && stage === "sold" && soldRevealed(item.id)) screen = "product";
  }
  if (item && screen === "product" && isPaid(item) && view === "auto" && !soldRevealed(item.id)) screen = "sold";

  const last = useRef(screen);
  useEffect(() => {
    if (screen && last.current && screen !== last.current) window.scrollTo({ top: 0 });
    last.current = screen;
  }, [screen]);

  const done = async () => {
    if (!item) return;
    await markDone(item.id);
    await refresh();
  };

  if (item && (screen === "product" || screen === "going")) {
    return (
      <main key={screen} className="pv2 flex flex-1 flex-col animate-fade">
        <Product item={item} going={screen === "going" || holdGoing} onMarkDone={done} />
      </main>
    );
  }
  if (item && screen === "sold") {
    return (
      <main className="pv2 flex flex-1 flex-col">
        <Sold item={item} onProduct={() => { setView("product"); window.scrollTo({ top: 0 }); }} onMarkDone={async () => { setView("sold"); await done(); }} />
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col px-5 pb-10 pt-[max(16px,env(safe-area-inset-top))]">
      {screen !== "wizard" && (
        <header className="flex min-h-14 items-center gap-2.5 py-2">
          <BackButton />
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
          {screen === "error" && <ErrorCard item={item} onRetry={() => setPatch({ from: item.status, data: { status: "publishing" } })} />}
        </div>
      )}
    </main>
  );
}

// ---------------------------------------------------------------- product page (prototype: renderProduct)

function Product({ item, going, onMarkDone }: { item: Item; going: boolean; onMarkDone: () => Promise<void> }) {
  const stage = dealStage(item);
  const closed = stage != null;
  const sold = stage === "sold";
  const entries = chatEntries(item);
  const adLive = !going && (closed || item.listings.some((l) => l.status === "live") || ["live", "negotiating", "needs_you"].includes(item.status));
  const stageIdx = closed ? 3 : entries.length ? 2 : adLive ? 1 : 0;
  const photo = coverFirst(item)[0];
  const title = item.title ?? item.recognition?.name ?? "Your ad";
  const price = dealPrice(item);
  const days = daysSince(item.createdAt);
  const chatCount = item.stats?.chats ?? item.conversations.length;

  const neg = entries.find((e) => e.negotiating);
  const talking = neg ?? entries.find((e) => e.c.state === "open" && e.c.messages.some((m) => m.from === "agent"));
  const nowDoing = talking ? `Poof is negotiating with ${talking.c.buyer.split(" ")[0]}` : adLive ? "Poof is watching for offers" : "Getting ready to go live";

  const allRemoved = item.listings.length > 0 && item.listings.every((l) => l.status === "removed");

  return (
    <div className="body2 has-nav" style={{ padding: 0 }}>
      <div className="hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <span className="ph">{photo && <img src={photo} alt={`${title}, ad photo`} />}</span>
        {closed && <span className="soldbadge">Sold</span>}
        <BackIcon href="/" className="l" />
      </div>
      <div style={{ padding: "18px 20px 24px" }}>
        <p className="xs muted">{[item.pickupCity, `listed ${days > 0 ? `${days} day${days === 1 ? "" : "s"} ago` : "just now"}`].filter(Boolean).join(" · ")}</p>
        <h1 className="q" style={{ fontSize: 24, marginTop: 2 }}>{title}</h1>
        <div className="price-row">
          <span className="p">{eur(closed ? price : item.askPrice)}</span>
          <span className="muted">{closed ? `sold · goal was ${eur(item.askPrice)}` : `goal · min ${eur(item.floorPrice)}`}</span>
        </div>
        <div className="seg4" style={{ marginTop: 16 }} aria-label="Status">
          {[0, 1, 2, 3].map((i) => <i key={i} className={i <= stageIdx ? "on" : ""} />)}
          {["Live", "Offers", "Negotiating", "Sold"].map((l, i) => <span key={l} className={i === stageIdx ? "cur" : ""}>{l}</span>)}
        </div>

        {going ? (
          <div style={{ marginTop: 18 }}><GoingLive item={item} /></div>
        ) : closed ? (
          <SoldCard item={item} sold={sold} onMarkDone={onMarkDone} />
        ) : (
          <div className="card pad" style={{ boxShadow: "var(--shadow-soft)", marginTop: 18 }}>
            <p className="sec" style={{ margin: "0 0 10px" }}>Now</p>
            <p className="row" style={{ gap: 8, margin: 0 }}>{neg && TYPING}<span className="grow">{nowDoing}</span></p>
          </div>
        )}

        {adLive && (
          <>
            <div className="sec" style={{ marginTop: 20 }}>
              <span>{closed ? "All chats for this ad" : "Chats"}</span>
              <Link href={`/item/${item.id}/chats`}>All chats</Link>
            </div>
            {entries.map((e, i) => <ChatEntryRow key={e.c.id} item={item} e={e} idx={i} />)}
            {!item.conversations.length && <p className="muted small">No chats yet. When a buyer messages, Poof answers within minutes.</p>}
            <FoldedLowOffers item={item} />
          </>
        )}

        <div className="tiles" style={{ marginTop: 20 }}>
          <div className="tile"><b>{adLive ? item.stats?.views ?? 0 : 0}</b><span>views</span></div>
          <div className="tile"><b>{adLive ? item.stats?.saves ?? 0 : 0}</b><span>saves</span></div>
          <div className="tile"><b>{chatCount}</b><span>chats</span></div>
        </div>

        {adLive && item.listings.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <p className="sec">{allRemoved ? "Removed from" : "Live on"}</p>
            <ul className="plat-compact">
              {item.listings.map((l, i) => (
                <li key={`${l.platform}-${i}`} style={{ animation: "fadeUp .28s var(--out) backwards", animationDelay: `${i * 35}ms` }}>
                  <PlatIcon platform={l.platform} size={40} />
                  <span className="grow">
                    <b>{PLATFORM[l.platform]}</b>
                    <span className="xs muted">{{ live: "Live", removed: "Taken offline after the sale", pending: "Posting", error: "Posting failed" }[l.status]}</span>
                  </span>
                  {l.status === "removed" ? <Ic n="check" /> : l.status === "live" && l.url ? (
                    <a className="viewlink" href={l.url} target="_blank" rel="noreferrer">View on {PLATFORM[l.platform]} ↗</a>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/** "Deal done" (pending handover) / "Sold" recap card. */
function SoldCard({ item, sold, onMarkDone }: { item: Item; sold: boolean; onMarkDone: () => Promise<void> }) {
  const buyer = dealBuyer(item) ?? "the buyer";
  const price = dealPrice(item);
  const conv = dealConversation(item);
  const recap = recapOf(item);
  const platform = item.sale?.platform ?? conv?.platform ?? "marktplaats";
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mark = async () => {
    setBusy(true); setErr(null);
    try { await onMarkDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not mark it as done"); }
    finally { setBusy(false); }
  };
  return (
    <div className="card pad soldcard" style={{ marginTop: 18 }}>
      <p className="sec" style={{ margin: "0 0 6px" }}>{sold ? "Sold" : "Deal done"}</p>
      <p style={{ margin: 0, fontWeight: 800, fontSize: 18 }}>To {buyer} for {eur(price)}</p>
      <p className="small muted" style={{ margin: "2px 0 14px" }}>Poof closed the deal on {PLATFORM[platform]}</p>
      <ol className="timeline">
        <li className={sold ? "done" : ""}><div><b>{handoverLabel(item)}</b><span>{buyer} comes to you{item.pickupCity ? ` in ${item.pickupCity}` : ""}</span></div></li>
        <li className={sold ? "done" : ""}><div><b>Get paid {eur(price)}</b><span>{paidOnline(item) ? `${buyer} already paid` : `${buyer} pays at pickup`}</span></div></li>
      </ol>
      <div className="recap divided" style={{ marginTop: 6 }}>
        <div><span>Time to sell</span><b>{recap.duration}</b></div>
        <div><span>Asked · sold for</span><b>{eur(item.askPrice)} · {eur(price)}</b></div>
        <div><span>Messages Poof handled</span><b>{recap.messages}</b></div>
        <div><span>Buyers talked to</span><b>{item.conversations.length}</b></div>
      </div>
      {!sold && <button className="btn" type="button" disabled={busy} onClick={mark} style={{ marginTop: 14 }}>{HANDOVER_DONE_LABEL}</button>}
      {err && <p className="xs" style={{ color: "var(--alert)", marginTop: 6 }}>{err}</p>}
      {conv && (
        <Link className={`btn${sold ? "" : " secondary"}`} href={`/item/${item.id}/chats/${encodeURIComponent(conv.id)}`} style={{ marginTop: 8 }}>
          See the deal with {buyer}
        </Link>
      )}
    </div>
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
