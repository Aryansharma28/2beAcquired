"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MOCK, listItems } from "@/lib/api";
import { eur, timeAgo } from "@/lib/format";
import { reset } from "@/lib/mock";
import type { ItemSummary } from "@/lib/types";
import { Button, PriceTag, StatusPill, Wordmark } from "@/components/ui";

export default function Home() {
  const [items, setItems] = useState<ItemSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      listItems()
        .then((r) => { if (alive) { setItems(r); setError(null); } })
        .catch((e: Error) => alive && setError(e.message));
    load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const isSold = (i: ItemSummary) => ["deal", "pickup_scheduled", "sold", "delisted"].includes(i.status);
  const selling = items?.filter((i) => !isSold(i)) ?? [];
  const sold = items?.filter(isSold) ?? [];
  const earned = sold.reduce((s, i) => s + (i.sale?.price ?? 0), 0);

  return (
    <main className="flex flex-1 flex-col px-5 pb-36 pt-[max(20px,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between py-3">
        <Wordmark className="text-[24px]" />
        {MOCK && (
          <button
            onClick={() => { reset(); location.reload(); }}
            className="rounded-full bg-card px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-mute ring-1 ring-line"
          >
            Demo · reset
          </button>
        )}
      </header>

      <section className="animate-rise pb-8 pt-6">
        <h1 className="font-display text-[44px] font-extrabold leading-[0.95] tracking-[-0.045em]">
          Your stuff,<br />
          <span className="relative inline-block">
            sold.
            {earned > 0 && <PriceTag amount={earned} size="sm" tilt={-8} className="absolute -right-[96px] -top-1" label="earned" />}
          </span>
        </h1>
        <p className="mt-4 max-w-[30ch] text-[16px] leading-snug text-ink-2">
          Snap a photo and set a minimum. The agent prices it, lists it, haggles, plans the pickup and takes the ad down. You just open the door.
        </p>
      </section>

      {error && (
        <p className="mb-4 rounded-2xl bg-alert-soft p-4 text-[14px] text-alert">
          Can&apos;t load your items: {error}
        </p>
      )}

      {items === null && !error && (
        <div className="space-y-3">
          {[0, 1].map((i) => <div key={i} className="skeleton h-[92px] rounded-3xl" />)}
        </div>
      )}

      {items && items.length === 0 && (
        <div className="rounded-3xl border-2 border-dashed border-line p-8 text-center text-ink-2">
          Nothing for sale yet. Start with something that&apos;s been in the hallway too long.
        </div>
      )}

      {selling.length > 0 && <Group title="Selling" items={selling} />}
      {sold.length > 0 && <Group title="Sold" items={sold} />}

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[440px] bg-gradient-to-t from-paper via-paper/95 to-transparent px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-10">
        <Button href="/new" className="w-full !py-4 !text-[18px]">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Sell something
        </Button>
      </div>
    </main>
  );
}

function Group({ title, items }: { title: string; items: ItemSummary[] }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-mute">
        {title} · {items.length}
      </h2>
      <ul className="space-y-2.5">
        {items.map((it, i) => (
          <li key={it.id} className="animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
            <ItemRow item={it} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ItemRow({ item }: { item: ItemSummary }) {
  const photo = item.photo ?? item.photos?.[0];
  const sold = item.sale?.price;
  const chats = item.conversations?.length ?? 0;
  return (
    <Link
      href={`/item/${item.id}`}
      className="flex items-center gap-3.5 rounded-3xl bg-card p-2.5 pr-4 ring-1 ring-line/60 transition active:scale-[0.98]"
    >
      <div className="size-[72px] shrink-0 overflow-hidden rounded-2xl bg-paper">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo && <img src={photo} alt="" className="size-full object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 font-display text-[16px] font-bold leading-[1.15] tracking-[-0.02em]">
          {item.title ?? "Working out what this is…"}
        </p>
        <div className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-mute">
          <StatusPill status={item.status} />
          <span className="shrink-0 whitespace-nowrap text-[12px]">
            {sold ? `for ${eur(sold)}` : chats ? `${chats} chat${chats > 1 ? "s" : ""}` : timeAgo(item.createdAt)}
          </span>
        </div>
      </div>
      {item.askPrice != null && !sold && <PriceTag amount={item.askPrice} size="sm" />}
    </Link>
  );
}
