"use client";

import { useState } from "react";
import { approve } from "@/lib/api";
import { chipFor, eur, planLine } from "@/lib/format";
import { coverFirst } from "@/lib/useItem";
import type { ApproveRequest, Item } from "@/lib/types";
import { Pencil } from "./Wizard";
import { BottomAction, Button, Eyebrow, PlatformLogo, PriceTag, Soon, cx } from "./ui";

/** 07 · Here's your ad. The owner's last say before the agent takes over. */
export function AdReview({ item, onApproved }: { item: Item; onApproved: (patch: Partial<Item>) => void }) {
  const photos = coverFirst(item);
  const [title, setTitle] = useState(item.title ?? "");
  const [price, setPrice] = useState(String(item.askPrice ?? ""));
  const [desc, setDesc] = useState(item.description ?? "");
  const [editing, setEditing] = useState<null | "title" | "price" | "desc">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceNum = Number(price.replace(",", "."));
  const priceOk = priceNum > 0 && (item.floorPrice == null || priceNum >= item.floorPrice);
  const plan = planLine(item);

  async function go() {
    const body: ApproveRequest = { itemId: item.id };
    if (title.trim() && title.trim() !== (item.title ?? "")) body.title = title.trim();
    if (desc.trim() && desc.trim() !== (item.description ?? "").trim()) body.description = desc.trim();
    if (priceOk && priceNum !== item.askPrice) body.askPrice = priceNum;
    setBusy(true);
    setError(null);
    try {
      await approve(body);
      onApproved({ status: "publishing", title: body.title ?? item.title, description: body.description ?? item.description, askPrice: body.askPrice ?? item.askPrice, listings: [] });
    } catch (e) {
      setError(`Couldn't publish: ${(e as Error).message}`);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 pb-28">
      <div className="px-1">
        <Eyebrow>Ready for your OK</Eyebrow>
        <h2 className="font-display text-[38px] font-extrabold leading-[0.95] tracking-[-0.045em]">Here&apos;s your ad</h2>
      </div>

      {/* Photos, cover first */}
      <div className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-px-5 px-5">
        {photos.map((p, i) => (
          <div key={i} className={cx("relative shrink-0 snap-start overflow-hidden rounded-[24px] bg-ink", photos.length > 1 ? "aspect-[4/3.4] w-[82%]" : "aspect-[4/3.2] w-full")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p} alt="" className="size-full object-cover" />
            {i === 0 && <span className="absolute left-3 top-3 rounded-full bg-ink/70 px-2.5 py-1 text-[12px] font-semibold text-white backdrop-blur">Cover</span>}
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-[26px] bg-card ring-1 ring-line/60">
        {/* Title */}
        <Field label="Title" onEdit={() => setEditing("title")} editing={editing === "title"}>
          {editing === "title" ? (
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => setEditing(null)} onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
              className="w-full rounded-xl bg-paper px-3 py-2 font-display text-[19px] font-bold tracking-[-0.02em] outline-none ring-2 ring-cobalt" />
          ) : (
            <p className="font-display text-[20px] font-bold leading-tight tracking-[-0.02em]">{title}</p>
          )}
        </Field>

        {/* Price */}
        <Field label="Price" onEdit={() => setEditing("price")} editing={editing === "price"}>
          {editing === "price" ? (
            <div className="flex items-center gap-2">
              <span className="font-mono text-[24px] font-bold text-mute">€</span>
              <input autoFocus inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ""))}
                onBlur={() => setEditing(null)} onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
                className="tabular w-28 rounded-xl bg-paper px-3 py-1.5 font-mono text-[24px] font-bold outline-none ring-2 ring-cobalt" />
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <PriceTag amount={priceOk ? priceNum : item.askPrice} size="md" />
              <span className="text-[14.5px] text-ink-2">· never below <b className="font-mono">{eur(item.floorPrice)}</b></span>
            </div>
          )}
          {!priceOk && price !== "" && <p className="mt-2 text-[13px] text-alert">That&apos;s under your {eur(item.floorPrice)} minimum.</p>}
          {plan && <p className="mt-2 font-mono text-[11.5px] leading-relaxed text-mute">{plan}</p>}
        </Field>

        {/* Description */}
        <Field label="Description" onEdit={() => setEditing("desc")} editing={editing === "desc"}>
          {editing === "desc" ? (
            <textarea autoFocus value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => setEditing(null)} rows={8}
              className="w-full rounded-xl bg-paper px-3 py-2 text-[15px] leading-relaxed outline-none ring-2 ring-cobalt" />
          ) : (
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink-2">{desc}</p>
          )}
        </Field>

        <div className="flex flex-wrap items-center gap-2 px-4 py-3.5">
          <Eyebrow className="mr-1">Details</Eyebrow>
          <span className="rounded-full bg-paper px-3 py-1 text-[13.5px] font-semibold">{chipFor(item.condition ?? item.recognition?.condition)}</span>
          <span className="rounded-full bg-paper px-3 py-1 text-[13.5px] font-semibold">Pickup {item.pickupCity ?? "Amsterdam"}</span>
        </div>
      </div>

      {/* Where */}
      <section>
        <Eyebrow className="mb-2 px-1">Where</Eyebrow>
        <ul className="overflow-hidden rounded-[26px] bg-card ring-1 ring-line/60">
          <li className="flex items-center gap-3 border-b border-line/70 px-4 py-3.5">
            <PlatformLogo platform="marktplaats" className="!size-7 !rounded-lg !text-[15px]" />
            <span className="flex-1 text-[16px] font-semibold">Marktplaats</span>
            <Toggle on />
          </li>
          {(["vinted", "ebay", "facebook"] as const).map((p) => (
            <li key={p} className="flex items-center gap-3 border-b border-line/70 px-4 py-3.5 text-mute last:border-0">
              <PlatformLogo platform={p} muted className="!size-7 !rounded-lg !text-[15px]" />
              <span className="flex-1 text-[16px] font-semibold">{{ vinted: "Vinted", ebay: "eBay", facebook: "Facebook Marketplace" }[p]}</span>
              <Soon />
              <Toggle on={false} />
            </li>
          ))}
        </ul>
      </section>

      <div className="flex items-start gap-3 rounded-[22px] bg-tag/40 px-4 py-3.5">
        <span className="mt-0.5 rounded-full bg-ink px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.12em] text-tag">Agent</span>
        <p className="text-[14.5px] font-medium leading-snug">A photo in daylight sells faster.</p>
      </div>

      {error && <p className="rounded-2xl bg-alert-soft p-4 text-[14px] text-alert">{error}</p>}

      <BottomAction>
        <Button onClick={go} disabled={busy || !title.trim() || (!priceOk && price !== "")} className="w-full !py-4 !text-[18px]">
          {busy ? <><span className="size-5 animate-spin rounded-full border-[3px] border-white/30 border-t-white" /> Approving…</> : "Approve and sell"}
        </Button>
        <p className="mt-2 text-center text-[12.5px] text-mute">After this your agent handles buyers, price and pickup on its own.</p>
      </BottomAction>
    </div>
  );
}

function Field({ label, children, onEdit, editing }: { label: string; children: React.ReactNode; onEdit: () => void; editing: boolean }) {
  return (
    <div className="border-b border-line/70 px-4 py-3.5">
      <div className="mb-1.5 flex items-center justify-between">
        <Eyebrow>{label}</Eyebrow>
        {!editing && (
          <button onClick={onEdit} className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-semibold text-cobalt" aria-label={`Edit ${label.toLowerCase()}`}>
            <Pencil className="!text-cobalt" /> Edit
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span role="switch" aria-checked={on} aria-disabled className={cx("relative inline-block h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-go" : "bg-line")}>
      <span className={cx("absolute top-1 size-5 rounded-full bg-white shadow transition-transform", on ? "translate-x-6" : "translate-x-1")} />
    </span>
  );
}
