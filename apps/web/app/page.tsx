"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAccount, type Account } from "@/lib/account";
import { SettingsSheet } from "@/components/Settings";
import { MOCK, listItems } from "@/lib/api";
import { eur, isClosed, isSetup, recentBuyerMessages } from "@/lib/format";
import { reset } from "@/lib/mock";
import type { ItemSummary } from "@/lib/types";
import { Button, NavBar, PriceTag, StatusPill, Wordmark } from "@/components/ui";

/** 09 · Your ads (home). */
export default function Home() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [settings, setSettings] = useState(false);
  const [items, setItems] = useState<ItemSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // First run → onboarding.
  useEffect(() => {
    getAccount()
      .then((a) => (a?.onboarded ? setAccount(a) : router.replace("/welcome")))
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

  const count = (f: (i: ItemSummary) => boolean) => items?.filter(f).length ?? 0;
  const summary = [
    [count((i) => i.status === "live" || i.status === "negotiating" || i.status === "needs_you"), "live"],
    [count((i) => isSetup(i.status)), "setting up"],
    [count((i) => isClosed(i.status)), "sold"],
    [count((i) => i.status === "error"), "need a look"],
  ].filter(([n]) => (n as number) > 0).map(([n, l]) => `${n} ${l}`).join(" · ");

  return (
    <main className="flex flex-1 flex-col px-5 pb-32 pt-[max(18px,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between py-2">
        <Wordmark className="text-[20px]" />
        <div className="flex items-center gap-2">
          {MOCK && (
            <button
              onClick={() => { reset(); location.reload(); }}
              className="rounded-full bg-card px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-mute ring-1 ring-line"
            >
              Demo · reset
            </button>
          )}
          {account && (
            <button
              onClick={() => setSettings(true)}
              aria-label="Settings"
              className="relative grid size-10 place-items-center rounded-full bg-ink font-display text-[17px] font-bold text-white transition active:scale-95"
            >
              {(account.name ?? "?")[0]?.toUpperCase()}
              <span className={`absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full ring-2 ring-paper ${account.mpConnected ? "bg-go" : "bg-tag"}`} />
            </button>
          )}
        </div>
      </header>

      {account && !account.mpConnected && (
        <button onClick={() => setSettings(true)} className="mt-3 flex w-full animate-rise items-center gap-3 rounded-[22px] bg-tag px-4 py-3.5 text-left">
          <span className="flex-1 text-[14.5px] font-semibold leading-snug">Connect Marktplaats so your agent can put ads online.</span>
          <span className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-[13px] font-bold text-white">Connect</span>
        </button>
      )}

      {account && (
        <SettingsSheet key={String(settings)} open={settings} onClose={() => setSettings(false)} account={account} onChange={setAccount} />
      )}

      <section className="animate-rise pb-5 pt-5">
        <h1 className="font-display text-[46px] font-extrabold leading-[0.92] tracking-[-0.05em]">Your ads</h1>
        {summary && <p className="mt-2 font-mono text-[13px] font-bold tracking-[0.02em] text-ink-2">{summary}</p>}
      </section>

      {error && (
        <p className="mb-4 rounded-2xl bg-alert-soft p-4 text-[14px] text-alert">
          Can&apos;t load your ads: {error}
        </p>
      )}

      {items === null && !error && (
        <div className="space-y-3">
          {[0, 1].map((i) => <div key={i} className="skeleton h-[96px] rounded-[26px]" />)}
        </div>
      )}

      {items && items.length === 0 && (
        <div className="flex flex-col items-center rounded-[28px] border-2 border-dashed border-line px-6 py-10 text-center">
          <PriceTag amount={0} size="md" tilt={-6} label="no ads yet" />
          <p className="mt-5 font-display text-[22px] font-bold tracking-[-0.02em]">Snap it. poof. Sold.</p>
          <p className="mt-1 max-w-[28ch] text-[15px] text-ink-2">Snap the thing that&apos;s been in the hallway too long. Your agent does the rest.</p>
          <Button href="/new" className="mt-5">Sell something</Button>
        </div>
      )}

      {items && items.length > 0 && (
        <ul className="space-y-2.5">
          {items.map((it, i) => (
            <li key={it.id} className="animate-rise" style={{ animationDelay: `${i * 50}ms` }}>
              <AdCard item={it} />
            </li>
          ))}
        </ul>
      )}

      <NavBar />
    </main>
  );
}

function AdCard({ item }: { item: ItemSummary }) {
  const photo = item.photo ?? item.photos?.[0];
  const sold = item.sale?.price;
  const unread = isClosed(item.status) ? 0 : recentBuyerMessages(item);
  const title = item.title ?? item.recognition?.name;
  return (
    <Link
      href={`/item/${item.id}`}
      className="relative flex items-center gap-3.5 rounded-[26px] bg-card p-2.5 pr-4 shadow-soft transition active:scale-[0.98]"
    >
      <div className="relative size-[76px] shrink-0 overflow-hidden rounded-[18px] bg-paper">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo && <img src={photo} alt="" className="size-full object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 font-display text-[16.5px] font-bold leading-[1.15] tracking-[-0.02em]">
          {title ?? "Looking at your photos…"}
        </p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <StatusPill status={item.status} />
          {!!unread && (
            <span className="rounded-full bg-cobalt px-2 py-0.5 text-[11.5px] font-bold text-white" aria-label={`${unread} new messages`}>
              {unread} new
            </span>
          )}
        </div>
      </div>
      {sold != null ? (
        <span className="font-mono text-[15px] font-bold text-go">{eur(sold)}</span>
      ) : item.askPrice != null ? (
        <PriceTag amount={item.askPrice} size="sm" />
      ) : null}
    </Link>
  );
}
