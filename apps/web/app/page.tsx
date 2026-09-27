"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAccount, type Account } from "@/lib/account";
import { SettingsSheet } from "@/components/Settings";
import { Navbar } from "@/components/Navbar";
import { MOCK, listItems } from "@/lib/api";
import { eur, lastTs } from "@/lib/format";
import type { ItemSummary } from "@/lib/types";
import { StatusChip, itemStatus, type ItemStatus } from "@/components/ui";

/** Tilts the prototype gives its home stickers; each ad keeps its own. */
const TILTS = [-3, 3, -2, 4, -4, 2];
function tiltOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return TILTS[Math.abs(h) % TILTS.length];
}

type Tile = { item: ItemSummary; status: ItemStatus; sold: boolean };

/** Home: "Your ads" (prototype `renderHome`). */
export default function Home() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [settings, setSettings] = useState(false);
  const [items, setItems] = useState<ItemSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"selling" | "sold">("selling");

  // First run → onboarding. Profile from another screen's navbar lands here as /?profile=1.
  useEffect(() => {
    getAccount()
      .then((a) => {
        if (!a?.onboarded) return router.replace("/welcome");
        setAccount(a);
        if (new URLSearchParams(location.search).has("profile")) {
          setSettings(true);
          router.replace("/");
        }
      })
      .catch((e: Error) => setError(e.message));
  }, [router]);

  useEffect(() => {
    if (!account) return;
    let alive = true;
    const load = () =>
      listItems()
        .then((r) => { if (alive) { setItems(r); setError(null); } })
        .catch((e: Error) => alive && setError(e.message));
    load();
    const t = setInterval(load, MOCK ? 2000 : 5000);
    return () => { alive = false; clearInterval(t); };
  }, [account]);

  const tiles: Tile[] = (items ?? []).map((item) => {
    const status = itemStatus(item);
    return { item, status, sold: status.kind === "sold" };
  });
  const selling = tiles
    .filter((t) => !t.sold)
    .sort((a, b) => (a.status.kind === "needs" ? -1 : 0) - (b.status.kind === "needs" ? -1 : 0));
  const sold = tiles.filter((t) => t.sold);
  const showSold = tab === "sold";
  const list = showSold ? sold : selling;

  return (
    <main className="body2 has-nav home" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 28px)" }}>
      <div className="home-head"><h1>Your ads</h1></div>

      {account && !account.mpConnected && (
        <div className="card pad" style={{ background: "var(--lime)", boxShadow: "none", margin: "0 0 22px" }}>
          <p className="sec" style={{ margin: "0 0 8px" }}>Needs you</p>
          <p style={{ margin: "0 0 14px", fontWeight: 700 }}>Connect Marktplaats so Poof can put your ads online.</p>
          <button className="btn" type="button" onClick={() => setSettings(true)}>Connect Marktplaats</button>
        </div>
      )}

      <div className="homeseg" role="tablist" aria-label="Your ads">
        <button type="button" role="tab" aria-selected={!showSold} onClick={() => setTab("selling")}>Selling <span>{selling.length}</span></button>
        <button type="button" role="tab" aria-selected={showSold} onClick={() => setTab("sold")}>Sold <span>{sold.length}</span></button>
      </div>

      {error && <p className="muted" style={{ textAlign: "center", padding: "0 0 22px" }}>Can&apos;t load your ads: {error}</p>}

      {items === null && !error ? (
        <ul className="grid-ads" aria-hidden="true">
          {[0, 1].map((i) => <li key={i}><span className="skeleton" style={{ display: "block", aspectRatio: "1", borderRadius: 12 }} /></li>)}
        </ul>
      ) : list.length ? (
        <ul className="grid-ads">
          {list.map((t, idx) => <AdTile key={t.item.id} tile={t} idx={idx} />)}
        </ul>
      ) : items !== null ? (
        <p className="muted" style={{ textAlign: "center", padding: "48px 0" }}>
          {showSold ? "Nothing sold yet." : "Nothing for sale. Tap + to sell something."}
        </p>
      ) : null}

      {account && (
        <SettingsSheet key={String(settings)} open={settings} onClose={() => setSettings(false)} account={account} onChange={setAccount} />
      )}

      <Navbar
        active="ads"
        chatsHref={chatsHref(items)}
        chatBadge={items?.filter((i) => i.status === "needs_you").length ?? 0}
        onProfile={account ? () => setSettings(true) : undefined}
      />
    </main>
  );
}

/** Chats go to the ad with the latest buyer chat, or else the newest ad that is online. */
function chatsHref(items: ItemSummary[] | null) {
  if (!items?.length) return undefined;
  const withChats = items
    .filter((i) => i.conversations?.length)
    .sort((a, b) => latest(b).localeCompare(latest(a)));
  const online = items.find((i) => ["live", "negotiating", "needs_you", "deal", "pickup_scheduled"].includes(i.status));
  const pick = withChats[0] ?? online;
  return pick ? `/item/${pick.id}/chats` : undefined;
}
const latest = (i: ItemSummary) => (i.conversations ?? []).map(lastTs).sort().at(-1) ?? "";

function AdTile({ tile, idx }: { tile: Tile; idx: number }) {
  const { item, status, sold } = tile;
  const tilt = tiltOf(item.id);
  const delay = idx * 35;
  const pending = status.kind === "pending";
  const photo = item.photo ?? item.photos?.[item.coverIndex ?? 0] ?? item.photos?.[0];
  const price = sold || pending ? item.sale?.price ?? item.askPrice : item.askPrice;
  const title = item.recognition?.name ?? item.title ?? "Looking at your photos…";
  return (
    <li style={{ animation: "fadeUp .28s var(--out) backwards", animationDelay: `${delay}ms` }}>
      <Link className={"gtile" + (sold ? " is-sold" : pending ? " is-pending" : "")} href={`/item/${item.id}`}>
        <span className="stickerwrap">
          <span className="ph cutout sticker" style={{ ["--tilt" as string]: `${tilt}deg` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {photo ? <img src={photo} alt="" /> : <span className="ph-empty" />}
          </span>
          {price != null && (
            <span
              className={"pricetag" + (sold ? " sold" : "")}
              style={{ ["--tilt" as string]: `${tilt > 0 ? -4 : 4}deg`, animation: "tagDrop .4s var(--out) backwards", animationDelay: `${delay + 150}ms` }}
            >
              {sold ? "Sold " : ""}{eur(price)}
            </span>
          )}
        </span>
        <span className="t">{title}</span>
        <span className="tile-status"><StatusChip {...status} /></span>
      </Link>
    </li>
  );
}
