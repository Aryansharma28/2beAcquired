"use client";

import { useState } from "react";
import { approve } from "@/lib/api";
import { chipFor, eur, planLine } from "@/lib/format";
import { coverFirst } from "@/lib/useItem";
import type { ApproveRequest, Item } from "@/lib/types";
import { Pencil } from "./Wizard";
import { BottomAction, Button, Eyebrow, PlatformLogo, PoofTag, Soon, Tick, cx } from "./ui";

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
    <div className="space-y-5 pb-36">
      <div>
        <p className="text-[13px] font-semibold text-moss">Ready for your OK</p>
        <h2 className="text-[26px] font-extrabold leading-tight tracking-[-0.02em]">Here&apos;s your ad</h2>
      </div>

      {/* Photos, cover first */}
      <div>
        <div className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-px-5 px-5">
          {photos.map((p, i) => (
            <div key={i} className={cx("relative h-[230px] shrink-0 snap-start overflow-hidden rounded-[20px] bg-limetint", photos.length > 1 ? "w-[82%]" : "w-full")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p} alt="" className="size-full object-cover" />
              <span className="absolute bottom-2 right-2 rounded-full bg-card px-2 py-0.5 text-[12px] font-semibold shadow-soft tabular">
                {i === 0 ? "Cover · " : ""}{i + 1} / {photos.length}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Title */}
      <Field label="Title" onEdit={() => setEditing("title")} editing={editing === "title"}>
        {editing === "title" ? (
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => setEditing(null)} onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
            className="min-h-12 w-full rounded-[12px] border-2 border-ink bg-card px-3.5 py-2 text-[18px] font-extrabold outline-none" />
        ) : (
          <p className="text-[20px] font-extrabold leading-[1.25]">{title}</p>
        )}
      </Field>

      {/* Price */}
      <Field label="Price" onEdit={() => setEditing("price")} editing={editing === "price"}>
        {editing === "price" ? (
          <div className="flex items-center gap-2">
            <span className="text-[28px] font-extrabold text-moss">€</span>
            <input autoFocus inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ""))}
              onBlur={() => setEditing(null)} onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
              className="tabular min-h-12 w-32 rounded-[12px] border-2 border-ink bg-card px-3 py-1 text-[26px] font-extrabold outline-none" />
          </div>
        ) : (
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-[28px] font-extrabold leading-none tabular">{eur(priceOk ? priceNum : item.askPrice)}</span>
            <span className="text-[15px] text-moss">never below {eur(item.floorPrice)}</span>
          </div>
        )}
        {!priceOk && price !== "" && <p className="mt-2 text-[13px] font-semibold text-alert">That&apos;s under your {eur(item.floorPrice)} minimum.</p>}
        {plan && <p className="mt-2 text-[13px] leading-relaxed text-moss">{plan}</p>}
      </Field>

      {/* Description */}
      <Field label="Description" onEdit={() => setEditing("desc")} editing={editing === "desc"}>
        {editing === "desc" ? (
          <textarea autoFocus value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => setEditing(null)} rows={8}
            className="w-full rounded-[12px] border-2 border-ink bg-card px-3.5 py-2.5 text-[15px] leading-relaxed outline-none" />
        ) : (
          <p className="whitespace-pre-line text-[15px] leading-[1.5]">{desc}</p>
        )}
      </Field>

      <section>
        <Eyebrow className="mb-2.5">Details</Eyebrow>
        <div className="grid grid-cols-2 rounded-[20px] bg-card shadow-soft">
          <div className="px-4 py-3">
            <span className="block text-[12px] text-moss">Condition</span>
            <b className="text-[14px] font-bold">{chipFor(item.condition ?? item.recognition?.condition)}</b>
          </div>
          <div className="border-l border-line px-4 py-3">
            <span className="block text-[12px] text-moss">Handover</span>
            <b className="text-[14px] font-bold">Pickup, {item.pickupCity ?? "Amsterdam"}</b>
          </div>
        </div>
      </section>

      {/* Where */}
      <section>
        <Eyebrow className="mb-2.5">Where</Eyebrow>
        <div role="switch" aria-checked aria-disabled className="flex min-h-[52px] items-center gap-2.5 rounded-[16px] bg-card px-3.5 shadow-[0_0_0_2px_var(--color-ink)]">
          <PlatformLogo platform="marktplaats" className="!size-7" />
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">Marktplaats</span>
          <Tick className="size-4" />
        </div>
        <ul className="mt-2.5 flex flex-wrap items-center gap-2">
          <li><Soon /></li>
          {(["ebay", "vinted", "facebook"] as const).map((p) => (
            <li key={p} role="switch" aria-checked={false} aria-disabled className="flex items-center gap-2 rounded-full bg-card/70 py-1 pl-1 pr-3 text-[13px] font-semibold text-moss">
              <PlatformLogo platform={p} muted className="!size-6" />
              {{ vinted: "Vinted", ebay: "eBay", facebook: "Facebook" }[p]}
            </li>
          ))}
        </ul>
      </section>

      <div className="flex items-start gap-2.5 rounded-[16px] bg-limetint px-3.5 py-3 text-[14px]">
        <PoofTag className="mt-px" />
        <p className="leading-snug">A photo in daylight sells faster.</p>
      </div>

      {error && <p className="rounded-[20px] bg-alert-soft p-4 text-[14px] text-alert">{error}</p>}

      <BottomAction>
        <Button onClick={go} disabled={busy || !title.trim() || (!priceOk && price !== "")} className="w-full">
          {busy ? <><span className="size-5 animate-spin rounded-full border-[3px] border-lime/30 border-t-lime" /> Approving…</> : <>Approve and sell <Arrow /></>}
        </Button>
        <p className="mt-2 text-center text-[13px] text-moss">After this Poof handles buyers, price and pickup on its own.</p>
      </BottomAction>
    </div>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function Field({ label, children, onEdit, editing }: { label: string; children: React.ReactNode; onEdit: () => void; editing: boolean }) {
  return (
    <section>
      <div className="mb-1.5 flex min-h-[34px] items-center justify-between">
        <Eyebrow>{label}</Eyebrow>
        {!editing && (
          <button onClick={onEdit} className="flex h-[34px] items-center gap-1.5 rounded-full bg-card px-3.5 text-[13px] font-bold text-ink shadow-soft" aria-label={`Edit ${label.toLowerCase()}`}>
            <Pencil className="!text-ink" /> Edit
          </button>
        )}
      </div>
      {children}
    </section>
  );
}
