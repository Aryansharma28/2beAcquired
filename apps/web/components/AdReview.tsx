"use client";

import Link from "next/link";
import { useState } from "react";
import { approve } from "@/lib/api";
import { attrText, chipFor } from "@/lib/format";
import { coverFirst } from "@/lib/useItem";
import type { ApproveRequest, Item } from "@/lib/types";
import { CtaArrow, Ic, MpIcon, SfScreen, goalPriceKey } from "./Wizard";
import { SoonStrip } from "./ui";

const STEP = 5;

function storedGoal(itemId: string): number | null {
  try {
    const v = Number(sessionStorage.getItem(goalPriceKey(itemId)));
    return v > 0 ? v : null;
  } catch { return null; }
}

/** Here's your ad (prototype renderAd). The owner's last say before Poof takes over. */
export function AdReview({ item, onApproved }: { item: Item; onApproved: (patch: Partial<Item>) => void }) {
  const photos = coverFirst(item);
  const floor = item.floorPrice;
  const [title, setTitle] = useState(item.title ?? "");
  const [desc, setDesc] = useState(item.description ?? "");
  // The goal price the owner set in the wizard wins over Poof's suggested start price.
  const [price, setPrice] = useState(() => {
    const g = typeof window === "undefined" ? null : storedGoal(item.id);
    return Math.max(floor ?? 0, g ?? item.askPrice ?? floor ?? 0);
  });
  const [editing, setEditing] = useState(false);
  const [shown, setShown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(0);

  const n = Math.max(1, photos.length);
  const attrs = (item.recognition?.attributes ?? []).map(attrText).filter(Boolean).map((a) => {
    const k = a.indexOf(":");
    return k < 0 ? ["Detail", a] : [a.slice(0, k).trim(), a.slice(k + 1).trim()];
  });

  function setGoal(v: number) {
    setPrice(Math.min(1999, Math.max(floor ?? 5, v)));
    setPulse((p) => p + 1);
  }

  async function go() {
    const body: ApproveRequest = { itemId: item.id };
    if (title.trim() && title.trim() !== (item.title ?? "")) body.title = title.trim();
    if (desc.trim() && desc.trim() !== (item.description ?? "").trim()) body.description = desc.trim();
    if (price > 0 && price !== item.askPrice) body.askPrice = price;
    setBusy(true);
    setError(null);
    try {
      await approve(body);
      try { sessionStorage.removeItem(goalPriceKey(item.id)); } catch { /* private mode */ }
      onApproved({ status: "publishing", title: body.title ?? item.title, description: body.description ?? item.description, askPrice: body.askPrice ?? item.askPrice, listings: [] });
    } catch (e) {
      setError(`Couldn't publish: ${(e as Error).message}`);
      setBusy(false);
    }
  }

  const priceOut = (v: number) => <output key={pulse} className={pulse ? "price-big pulse" : "price-big"} style={{ fontSize: 20 }}>€{v}</output>;

  return (
    <SfScreen>
      <div className="layer">
        <div className="top2">
          <Link href="/" className="icon-btn" aria-label="Back"><Ic n="back" /></Link>
          <div className="grow" style={{ flex: 1, minWidth: 0 }}>
            <p className="eyebrow">Ready for your OK</p>
            <h1 className="bar-title" style={{ fontSize: 19 }}>Here&apos;s your ad</h1>
          </div>
          <button className="btn secondary" type="button" onClick={() => setEditing((e) => !e)} style={{ minHeight: 36, padding: "0 14px", fontSize: 13 }}>
            {editing ? "Done" : "Edit"}
          </button>
        </div>
        <div className="body2">
          <div className="gallery">
            <span className="ph main">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {photos[shown] && <img src={photos[shown]} alt={`${title}, photo ${shown + 1}`} />}
              <span className="ph-note">{shown + 1} / {n}</span>
            </span>
          </div>
          {photos.length > 0 && (
            <div className="thumbs" style={{ marginTop: 8 }}>
              {photos.map((p, i) => (
                <button key={i} type="button" aria-pressed={shown === i} aria-label={`Photo ${i + 1}`} onClick={() => setShown(i)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <span className="ph"><img src={p} alt="" /></span>
                </button>
              ))}
            </div>
          )}
          <p
            className="ad-title"
            contentEditable={editing}
            suppressContentEditableWarning
            onBlur={(e) => setTitle(e.currentTarget.textContent ?? "")}
          >
            {title}
          </p>
          {editing ? (
            <>
              <div className="row" style={{ gap: 20, marginTop: 10 }}>
                <div className="goalrow" style={{ flex: 1, justifyContent: "flex-start", gap: 10, margin: 0 }}>
                  <b className="lbl">Goal</b>
                  <div className="stepper" style={{ boxShadow: "none", padding: 0 }}>
                    <button className="icon-btn" type="button" onClick={() => setGoal(price - STEP)} disabled={floor != null && price <= floor} aria-label="Lower goal"><Ic n="minus" /></button>
                    {priceOut(price)}
                    <button className="icon-btn" type="button" onClick={() => setGoal(price + STEP)} aria-label="Raise goal"><Ic n="plus" /></button>
                  </div>
                </div>
              </div>
              {floor != null && (
                <div className="row" style={{ gap: 20, marginTop: 6 }}>
                  <div className="goalrow" style={{ flex: 1, justifyContent: "flex-start", gap: 10, margin: 0, minHeight: 44 }}>
                    <b className="lbl">Min</b>
                    <output className="price-big" style={{ fontSize: 20 }}>€{floor}</output>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="price-row">
              <span className="p">€{price}</span>
              {floor != null && <span className="muted">never below €{floor}</span>}
            </div>
          )}
          <p className="sec">Description</p>
          <p
            className="small"
            style={{ color: "var(--moss)", lineHeight: 1.5, whiteSpace: "pre-line" }}
            contentEditable={editing}
            suppressContentEditableWarning
            onBlur={(e) => setDesc(e.currentTarget.innerText ?? "")}
          >
            {desc}
          </p>
          <p className="sec">Details</p>
          <div className="grid2 card" style={{ boxShadow: "var(--shadow-soft)" }}>
            <div><span>Condition</span><b>{chipFor(item.condition ?? item.recognition?.condition)}</b></div>
            {attrs[0] && <div><span>{attrs[0][0]}</span><b>{attrs[0][1]}</b></div>}
            <div><span>Handover</span><b>Pickup, {item.pickupCity ?? "Amsterdam"}</b></div>
            {attrs[1] && <div><span>{attrs[1][0]}</span><b>{attrs[1][1]}</b></div>}
          </div>
          <p className="sec">Where</p>
          <div className="plat-toggles">
            <label className="ptog">
              <input type="checkbox" checked disabled readOnly />
              <span><MpIcon size={28} /><span>Marktplaats</span><Ic n="check" /></span>
            </label>
          </div>
          <SoonStrip style={{ marginTop: 8 }} />
          {error && <p className="sf-error">{error}</p>}
        </div>
        <div className="foot2">
          <button className="btn" type="button" onClick={go} disabled={busy || !title.trim()}>
            {busy ? <><span className="sf-spin" /> Approving…</> : <>Approve and sell<CtaArrow /></>}
          </button>
        </div>
      </div>
    </SfScreen>
  );
}
