"use client";

import { useState, type CSSProperties } from "react";
import { eur } from "@/lib/format";
import { coverFirst } from "@/lib/useItem";
import type { Item } from "@/lib/types";
import { Icon, PlatformLogo, PriceTag, Sheet, cx } from "./ui";

/** Cover photo with the scanning sweep. */
export function ScanPhoto({ item, scanning, className, style }: { item: Item; scanning: boolean; className?: string; style?: CSSProperties }) {
  const photo = coverFirst(item)[0];
  return (
    <div className={cx("relative ph", className)} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photo && <img src={photo} alt="" />}
      {scanning && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(215,245,122,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(215,245,122,0.16)_1px,transparent_1px)] bg-[size:28px_28px]" />
          <div className="pointer-events-none absolute inset-x-0 h-24 -translate-y-full animate-scan bg-gradient-to-b from-transparent to-lime/50">
            <div className="absolute inset-x-0 bottom-0 h-[2px] bg-lime shadow-[0_0_12px_2px_rgba(215,245,122,0.9)]" />
          </div>
        </>
      )}
    </div>
  );
}

/** Recognizing: "Looking at your photos…" with Poof's steps as they land (prototype step list). */
export function Looking({ item }: { item: Item }) {
  const name = item.recognition?.name;
  return (
    <div>
      <div style={{ position: "relative" }}>
        <ScanPhoto item={item} scanning className="setup-cover" />
        {name && (
          <div className="agent setup-looks" style={{ background: "var(--surface)", boxShadow: "var(--shadow-float)" }}>
            <span className="grow"><span className="eyebrow">Looks like</span><b style={{ display: "block", fontSize: 20, fontWeight: 800, letterSpacing: "-.02em" }}>{name}</b></span>
          </div>
        )}
      </div>
      <div className="recog">
        <h1 className="q">Looking at your photos…</h1>
        <p className="sub">About a minute. Then two quick questions.</p>
      </div>
      <ol className="steps card divided" style={{ boxShadow: "var(--shadow-soft)" }}>
        {item.events.map((e, i) => (
          <li key={`${e.ts}-${i}`} className="step" data-state="done" style={{ animation: "fadeUp .28s var(--out) backwards" }}>
            <span className="st-ico"><Icon name="check" /></span><div className="grow"><b>{e.text}</b></div>
          </li>
        ))}
        <li className="step" data-state="running">
          <span className="st-ico"><Icon name="check" /></span><div className="grow"><span className="skeleton" style={{ display: "block", height: 14, width: "66%", borderRadius: 999, marginTop: 4 }} /></div>
        </li>
      </ol>
    </div>
  );
}

type StepState = "done" | "running" | "next";
type Step = { key: string; text: string; state: StepState; action?: { label: string; onClick: () => void } };

/** Poof is on it (prototype `renderWorking`). */
export function Writing({ item }: { item: Item }) {
  const [comps, setComps] = useState(false);
  const has = (re: RegExp) => item.events.some((e) => re.test(e.text));
  const n = item.compsCount ?? item.comps?.length ?? 0;
  const short = item.recognition?.name;
  const done = [
    !!short || has(/lens|recogni/i),
    n > 0,
    item.askPrice != null,
    item.status === "ad_ready" || !!item.description,
  ];
  const firstOpen = done.findIndex((d) => !d);
  const state = (i: number): StepState => (done[i] ? "done" : i === firstOpen ? "running" : "next");
  const steps: Step[] = [
    { key: "rec", text: short ? `Recognised your ${short}` : "Recognising your item", state: state(0) },
    {
      key: "comps", text: n ? `Found ${n} similar listings` : "Finding similar listings", state: state(1),
      action: item.comps?.length ? { label: "See them", onClick: () => setComps(true) } : undefined,
    },
    { key: "price", text: item.askPrice != null ? `Priced at ${eur(item.askPrice)}` : "Pricing it", state: state(2) },
    { key: "ad", text: done[3] ? "Wrote your ad" : "Writing your ad", state: state(3) },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, paddingTop: 24 }}>
      <div className="row" style={{ marginBottom: 22 }}>
        <ScanPhoto item={item} scanning={false} className="ph cutout sticker setup-thumb" style={{ ["--tilt" as string]: "-3deg" }} />
        <div className="grow"><p className="eyebrow">{short ?? "Your item"}</p><h1 className="q" style={{ margin: 0, fontSize: 24 }}>Poof is on it</h1></div>
      </div>
      <ol className="steps card divided" style={{ boxShadow: "var(--shadow-soft)" }}>
        {steps.map((s) => (
          <li key={s.key} className="step" data-state={s.state}>
            <span className="st-ico"><Icon name="check" /></span>
            <div className="grow"><b>{s.text}</b></div>
            {s.action && <button type="button" className="viewlink" onClick={s.action.onClick}>{s.action.label}</button>}
          </li>
        ))}
      </ol>
      <CompsSheet item={item} open={comps} onClose={() => setComps(false)} />
    </div>
  );
}

export function CompsSheet({ item, open, onClose }: { item: Item; open: boolean; onClose: () => void }) {
  const comps = [...(item.comps ?? [])].sort((a, b) => a.price - b.price);
  const n = item.compsCount ?? comps.length;
  return (
    <Sheet open={open} onClose={onClose} title={`${n} similar listings`}>
      {item.priceRange && (
        <p className="-mt-1 mb-3 text-[14px] text-moss">
          Most sell for <b className="font-mono">{eur(item.priceRange.low)}</b> to <b className="font-mono">{eur(item.priceRange.high)}</b>
          {comps.length < n && <> · showing {comps.length}</>}
        </p>
      )}
      <ul className="space-y-2">
        {comps.map((c, i) => (
          <li key={i}>
            <a href={c.url} target="_blank" rel="noreferrer" className="flex min-h-[52px] items-center gap-3 rounded-[16px] bg-card px-3.5 py-2.5 shadow-soft">
              <PlatformLogo platform={c.platform ?? "marktplaats"} className="!size-7" />
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{c.title}</span>
              <PriceTag amount={c.price} size="sm" tilt={0} />
            </a>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
