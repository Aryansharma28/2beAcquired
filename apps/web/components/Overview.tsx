"use client";

import Link from "next/link";
import { eur, isClosed, lastTs, nowLine, pickupWhen, timeAgo } from "@/lib/format";
import { coverFirst } from "@/lib/useItem";
import type { Conversation, Item } from "@/lib/types";
import { AgentLog } from "./AgentLog";
import { Icon, PlatformLogo } from "./ui";

const STAGES = ["Live", "Offers", "Negotiating", "Sold"];

function stageOf(item: Item) {
  if (isClosed(item.status)) return 3;
  const convs = item.conversations.filter((c) => c.state !== "declined");
  if (convs.some((c) => c.messages.some((m) => m.from === "agent")) || item.status === "negotiating") return 2;
  if (item.conversations.length) return 1;
  return 0;
}

/** How this ad is going: the prototype's product page body (`renderProduct`). */
export function Overview({ item }: { item: Item }) {
  const photo = coverFirst(item)[0];
  const live = item.listings.find((l) => l.status === "live");
  const goal = live?.price ?? item.askPrice;
  const stage = stageOf(item);
  const sold = item.status === "sold" || item.status === "delisted";
  const deal = isClosed(item.status);
  const negotiating = item.status === "negotiating" || item.status === "needs_you";
  const convs = [...item.conversations].filter((c) => c.state !== "declined").sort((a, b) => lastTs(b).localeCompare(lastTs(a)));
  const chats = item.stats?.chats ?? item.conversations.length;
  const title = item.title ?? item.recognition?.name;
  const buyer = item.sale?.buyer ?? item.pickup?.buyer;
  const price = item.sale?.price;

  return (
    <div>
      <div className="ov-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <span className="ph">{photo && <img src={photo} alt={title ? `${title}, ad photo` : ""} />}</span>
        {sold && <span className="soldbadge">Sold</span>}
      </div>

      <div style={{ padding: "18px 0 24px" }}>
        <p className="xs muted">{[item.pickupCity, `listed ${timeAgo(item.createdAt)}`].filter(Boolean).join(" · ")}</p>
        <h1 className="q" style={{ fontSize: 24, marginTop: 2 }}>{title}</h1>
        <div className="price-row">
          <span className="p">{eur(deal ? price ?? goal : goal)}</span>
          <span className="muted">
            {deal ? `sold · goal was ${eur(goal)}` : item.floorPrice != null ? `goal · min ${eur(item.floorPrice)}` : "goal"}
          </span>
        </div>
        <div className="seg4" style={{ marginTop: 16 }} aria-label="Status">
          {STAGES.map((_, i) => <i key={i} className={i <= stage ? "on" : ""}></i>)}
          {STAGES.map((l, i) => <span key={l} className={i === stage ? "cur" : ""}>{l}</span>)}
        </div>

        {deal ? (
          <div className="card pad soldcard" style={{ marginTop: 18 }}>
            <p className="sec" style={{ margin: "0 0 6px" }}>{sold ? "Sold" : "Deal done"}</p>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 18 }}>{buyer ? `To ${buyer.split(" ")[0]} for ${eur(price ?? goal)}` : `For ${eur(price ?? goal)}`}</p>
            <p className="small muted" style={{ margin: "2px 0 14px" }}>Poof closed the deal on Marktplaats</p>
            <ol className="timeline">
              <li className={sold ? "done" : ""}>
                <div>
                  <b>{item.pickup ? `Pickup ${pickupWhen(item.pickup.start).weekday} ${pickupWhen(item.pickup.start).time}` : "Pickup"}</b>
                  <span>{buyer ? `${buyer.split(" ")[0]} comes to you${item.pickupCity ? ` in ${item.pickupCity}` : ""}` : "Poof is planning it with the buyer"}</span>
                </div>
              </li>
              <li className={sold ? "done" : ""}><div><b>Get paid {eur(price ?? goal)}</b><span>{buyer ? `${buyer.split(" ")[0]} pays at pickup` : "Paid at pickup"}</span></div></li>
            </ol>
          </div>
        ) : (
          <div className="card pad" style={{ boxShadow: "var(--shadow-soft)", marginTop: 18 }}>
            <p className="sec" style={{ margin: "0 0 10px" }}>Now</p>
            <p className="row" style={{ gap: 8, margin: 0 }}>
              {negotiating && <span className="typing" aria-hidden="true"><i></i><i></i><i></i></span>}
              <span className="grow">{nowLine(item)}</span>
            </p>
          </div>
        )}

        {convs.length > 0 && (
          <>
            <div className="sec" style={{ marginTop: 20 }}>
              <span>{sold ? "All chats for this ad" : "Chats"}</span>
              <Link href={`/item/${item.id}/chats`}>All chats</Link>
            </div>
            {convs.slice(0, 3).map((c, i) => <ChatRow key={c.id} item={item} c={c} idx={i} />)}
          </>
        )}

        <div className="tiles" style={{ marginTop: 20 }}>
          <div className="tile"><b>{item.stats?.views ?? 0}</b><span>views</span></div>
          <div className="tile"><b>{item.stats?.saves ?? 0}</b><span>saves</span></div>
          <div className="tile"><b>{chats}</b><span>chats</span></div>
        </div>

        {item.listings.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <p className="sec">{sold ? "Removed from" : "Live on"}</p>
            <ul className="plat-compact">
              {item.listings.map((l) => (
                <li key={l.platform}>
                  <PlatformLogo platform={l.platform} className="!size-10" />
                  <span className="grow">
                    <b>{l.platform === "marktplaats" ? "Marktplaats" : "eBay"}</b>
                    <span className="xs muted">
                      {l.status === "live" ? "Live" : l.status === "pending" ? "Going live" : l.status === "removed" ? "Taken offline after the sale" : "Didn't go live"}
                    </span>
                  </span>
                  {l.status === "live" && l.url ? (
                    <a className="viewlink" href={l.url} target="_blank" rel="noreferrer">View on {l.platform === "marktplaats" ? "Marktplaats" : "eBay"} ↗</a>
                  ) : l.status === "removed" ? <Icon name="check" /> : null}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pline" style={{ marginTop: 24 }} />
        <div className="sec"><span>Everything Poof did</span><span>{item.floorPrice != null ? `${eur(item.floorPrice)} minimum` : ""}</span></div>
        <AgentLog item={item} />
      </div>
    </div>
  );
}

function ChatRow({ item, c, idx }: { item: Item; c: Conversation; idx: number }) {
  const last = c.messages.at(-1);
  const poofSpoke = last?.from === "agent";
  const offer = c.lastOffer ?? [...c.messages].reverse().find((m) => m.offer != null)?.offer;
  return (
    <Link
      className="chat-row calm"
      href={`/item/${item.id}/chats/${c.id}`}
      style={{ animation: "fadeUp .28s var(--out) backwards", animationDelay: `${idx * 35}ms` }}
    >
      <span className="pavatar">
        <PlatformLogo platform={c.platform} className="!size-10" />
        <span className="who" aria-hidden="true">{(c.buyer || "?")[0]?.toUpperCase()}</span>
      </span>
      <span className="grow">
        <span className="top-line"><b className="normal">{c.buyer}</b></span>
        <span className="last">
          {poofSpoke && <span className="poofsaid"><svg className="icon cloudmark"><use href="#i-cloudmark" /></svg> Poof:</span>}
          {last?.text ?? "No messages yet"}
        </span>
      </span>
      {offer != null && <span className="side"><span className="offer-pill">{eur(offer)}</span></span>}
    </Link>
  );
}
