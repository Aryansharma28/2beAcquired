"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { getAccount } from "@/lib/account";
import { details, rename } from "@/lib/api";
import { CONDITIONS, CONDITION_NL, attrText, chipFor, eur, type ConditionChip } from "@/lib/format";
import type { Goal, Item } from "@/lib/types";
import { cx } from "./ui";

/* ------------------------------------------------------------------ sell-flow primitives
 * Markup and class names follow design/visual/prototype.html (styles: the ".sf" block at the
 * end of globals.css). Shared by the sell-flow screens: /new, Wizard, AdReview, NeedsConnection, GoingLive. */

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
const STEP = 5;

type IconName = "close" | "back" | "check" | "edit" | "plus" | "minus" | "gallery" | "flash" | "pin" | "box" | "swap";

/** Prototype icon sprite (the <symbol id="i-…"> set), inline. */
export function Ic({ n, className }: { n: IconName; className?: string }) {
  const body: Record<IconName, ReactNode> = {
    close: <path d="M6 6l12 12M18 6L6 18" />,
    back: <path d="M15 5l-7 7 7 7" />,
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    edit: <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    gallery: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="M4 18l5-5 4 4 3-3 4 4" /></>,
    flash: <path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z" />,
    pin: <><path d="M12 21s-6-5.5-6-11a6 6 0 1 1 12 0c0 5.5-6 11-6 11z" /><circle cx="12" cy="10" r="2.2" /></>,
    box: <><path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5v-9z" /><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9" /></>,
    swap: <path d="M7 7h11l-3-3M17 17H6l3 3" />,
  };
  return <svg className={cx("icon", className)} viewBox="0 0 24 24" aria-hidden>{body[n]}</svg>;
}

export function CtaArrow() {
  return <svg className="icon cta-ic" viewBox="0 0 24 24" aria-hidden><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>;
}

/** Sticker photo (prototype `sticker()` / `stickerSized()`), from the owner's own photo. */
export function Sticker({ src, tilt, size }: { src?: string; tilt: number; size?: number }) {
  const style = { "--tilt": `${tilt}deg`, ...(size ? { width: size, height: size } : {}) } as CSSProperties;
  return (
    <span className="ph cutout sticker photo" style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt="" />}
    </span>
  );
}

/** Marktplaats app icon on a white tile (prototype `platIcon('marktplaats', size)`). */
export function MpIcon({ size = 34 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size, height: size, borderRadius: Math.round(size * 0.22), background: "#fff", border: "1px solid var(--line)",
        display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none", boxSizing: "border-box",
        padding: Math.round(size * 0.15), overflow: "hidden",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logos/marktplaats.png" alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
    </span>
  );
}

/** Full-screen phone layer the sell flow lives in (prototype #phone / .sell-sheet). */
export function SfScreen({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("sf sf-screen", className)}>{children}</div>;
}

/** Step bar: grows from 0 to its width on every new screen, like the prototype. */
function WizBar({ w }: { w: number }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const r = requestAnimationFrame(() => setWidth(w));
    return () => cancelAnimationFrame(r);
  }, [w]);
  return <div className="wizbar" aria-hidden><i style={{ width: `${width}%` }} /></div>;
}

/** The owner's goal price from the wizard, applied as the ask price when they approve the ad. */
export const goalPriceKey = (itemId: string) => `poof:goalPrice:${itemId}`;

/* ------------------------------------------------------------------ wizard */

type Speed = "fast" | "best";
const SPEED_INFO: Record<Speed, { label: string; line: string; goal: Goal }> = {
  fast: { label: "Sell fast", line: "Gone in about 3 days, for a slightly lower price", goal: "week" },
  best: { label: "Best price", line: "Gone in 2 weeks or more, holding out for the best price", goal: "no_rush" },
};
const COND_HELP: Record<ConditionChip, string> = {
  New: "Never used, still in the box or with tags.",
  "Like new": "Used a few times, no visible marks.",
  Good: "Normal signs of use, everything works.",
  Used: "Clear marks or wear, still works.",
};

type Market = Pick<Item, "priceRange" | "compsCount" | "comps">;

function goalFor(speed: Speed, m: Market, floor: number) {
  const r = m.priceRange;
  const g = speed === "fast" ? round5(r?.mid ?? floor + 10) : round5(r?.high ?? floor + 20);
  return Math.max(floor + STEP, g);
}

/** Is this it? → minimum + goal → handover. Only "Create my ad" calls the API (plus rename on "Fix it"). */
export function Wizard({ item, onSubmitted }: { item: Item; onSubmitted: (patch: Partial<Item>) => void }) {
  const rec = item.recognition ?? {};
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<"fwd" | "back" | null>(null);
  const [cover, setCover] = useState(item.coverIndex ?? 0);
  const [coverTouched, setCoverTouched] = useState(false);
  const [name, setName] = useState(rec.name ?? item.title ?? "");
  const [fixOpen, setFixOpen] = useState(!rec.name && !item.title);
  const [condition, setCondition] = useState<ConditionChip>(chipFor(rec.condition ?? item.condition));
  const [attrs, setAttrs] = useState<string[]>((rec.attributes ?? []).map(attrText).filter(Boolean));
  const [editingAttr, setEditingAttr] = useState<number | null>(null);
  // Market picture: from intake, or re-checked after the owner corrected the name.
  const [market, setMarket] = useState<Market>({ priceRange: item.priceRange, compsCount: item.compsCount, comps: item.comps });
  const [speed, setSpeed] = useState<Speed>("best");
  const [floor, setFloor] = useState(() => round5(item.priceRange?.low ?? 70));
  const [goalPrice, setGoalPrice] = useState(() => goalFor("best", item, round5(item.priceRange?.low ?? 70)));
  const [city, setCity] = useState(item.pickupCity || "");
  const [cityEdit, setCityEdit] = useState(false);
  const [pulse, setPulse] = useState(0);
  // Default the pickup city to the owner's profile (the ad's location), not a fixed city.
  useEffect(() => {
    if (city) return;
    getAccount().then((a) => setCity((c) => c || a?.pickupCity || "Amsterdam")).catch(() => setCity((c) => c || "Amsterdam"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pricedName, setPricedName] = useState((rec.name ?? item.title ?? "").trim());
  const [repricing, setRepricing] = useState(false);

  const photos = item.photos;
  const coverSrc = photos[cover] ?? photos[0];
  const shortName = name.trim() || "Your item";

  const go = (d: 1 | -1) => { setDir(d > 0 ? "fwd" : "back"); setError(null); setStep((s) => s + d); };
  const bump = () => setPulse((p) => p + 1);

  function setMin(v: number) {
    const m = Math.min(995, Math.max(5, v));
    setFloor(m);
    if (goalPrice <= m) setGoalPrice(m + STEP);
    bump();
  }
  function setGoal(v: number) { setGoalPrice(Math.min(1999, Math.max(floor + STEP, v))); bump(); }
  function pickSpeed(s: Speed) { setSpeed(s); setGoalPrice(goalFor(s, market, floor)); bump(); }

  /** Is this it? → next. If the name was corrected, price the corrected product first. */
  async function confirmName() {
    const n = name.trim();
    if (!n) return;
    if (n.toLowerCase() === pricedName.toLowerCase()) return go(1);
    setRepricing(true);
    setError(null);
    try {
      const r = await rename(item.id, n);
      const m: Market = { priceRange: r.priceRange ?? undefined, compsCount: r.compsCount, comps: r.comps };
      setMarket(m);
      if (r.priceRange?.low) {
        const f = round5(r.priceRange.low);
        setFloor(f);
        setGoalPrice(goalFor(speed, m, f));
      }
      setPricedName(n);
      setFixOpen(false);
      go(1);
    } catch (e) {
      setError(`Couldn't check prices for "${n}": ${(e as Error).message}. Try again, or set the minimum yourself.`);
      setPricedName(n); // don't block: a second tap continues with the old market data
    } finally {
      setRepricing(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const goal = SPEED_INFO[speed].goal;
    const body = {
      itemId: item.id, name: name.trim() || "Item", condition: CONDITION_NL[condition], goal, floorPrice: floor,
      delivery: "pickup" as const, pickupCity: city.trim() || "Amsterdam",
      coverIndex: cover, conditionLabel: condition, attributes: attrs,
    };
    try {
      await details(body);
      try { sessionStorage.setItem(goalPriceKey(item.id), String(goalPrice)); } catch { /* private mode */ }
      onSubmitted({ status: "writing", goal, floorPrice: floor, coverIndex: cover, pickupCity: body.pickupCity, recognition: { ...rec, name: body.name } });
    } catch (e) {
      setError(`Couldn't create the ad: ${(e as Error).message}`);
      setBusy(false);
    }
  }

  const nameChanged = name.trim().toLowerCase() !== pricedName.toLowerCase();

  return (
    <SfScreen>
      <div key={step} className={cx("layer", dir === "fwd" && "in-fwd", dir === "back" && "in-back")}>
        <div className="top2">
          {step === 0 ? (
            <Link href="/" className="icon-btn" aria-label="Back"><Ic n="back" /></Link>
          ) : (
            <button className="icon-btn" type="button" aria-label="Back" onClick={() => go(-1)}><Ic n="back" /></button>
          )}
          <WizBar w={[33, 66, 100][step]} />
          <span className="step-count">{step + 1} of 3</span>
        </div>

        {step === 0 && (
          <>
            <div className="body2">
              <h1 className="q">Is this it?</h1>
              <p className="sub">Poof recognised it from your photos.</p>
              <button className="cover" type="button" aria-label="Cover photo">
                <span className="ph">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {coverSrc && <img src={coverSrc} alt={`${shortName}, cover photo`} />}
                  <span className="ph-note">{coverTouched ? "Cover" : "Picked by Poof"}</span>
                </span>
              </button>
              {photos.length > 0 && (
                <div className="thumbs">
                  {photos.map((p, i) => (
                    <button key={i} type="button" aria-pressed={cover === i} aria-label={`Photo ${i + 1}`} onClick={() => { setCover(i); setCoverTouched(true); }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <span className="ph"><img src={p} alt="" /></span>
                    </button>
                  ))}
                </div>
              )}
              <div className="recog">
                <p className="eyebrow">What it is</p>
                <h2>{name.trim() || "Not sure yet"}</h2>
                <p className="muted">{[rec.category ?? item.category?.split(" › ").at(-1), condition].filter(Boolean).join(" · ")}</p>
              </div>
              {fixOpen && (
                <div className="fixsheet" id="fixList">
                  <p className="sec" style={{ margin: "0 0 8px" }}>What is it?</p>
                  <div className="field">
                    <label htmlFor="fixName">Name</label>
                    <input
                      id="fixName" type="text" autoFocus value={name} placeholder="e.g. IKEA POÄNG"
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && name.trim() && confirmName()}
                    />
                  </div>
                </div>
              )}
              <p className="sec">Condition</p>
              <div className="chips" role="radiogroup" aria-label="Condition">
                {CONDITIONS.map((c) => (
                  <label key={c} className="rchip">
                    <input type="radio" name="cond" checked={condition === c} onChange={() => setCondition(c)} />
                    <span>{c}</span>
                  </label>
                ))}
              </div>
              <p className="helper">{COND_HELP[condition]}</p>
              {attrs.length > 0 && (
                <>
                  <p className="sec">Details</p>
                  <dl className="dl card divided" style={{ boxShadow: "var(--shadow-soft)" }}>
                    {attrs.map((a, i) => {
                      const k = a.indexOf(":");
                      const label = k < 0 ? "Detail" : a.slice(0, k).trim();
                      const value = k < 0 ? a : a.slice(k + 1).trim();
                      const set = (v: string) => setAttrs(attrs.map((x, j) => (j === i ? (k < 0 ? v : `${label}: ${v}`) : x)));
                      return (
                        <div key={i}>
                          <dt>{label}</dt>
                          <dd>
                            {editingAttr === i ? (
                              <input autoFocus value={value} aria-label={label} onChange={(e) => set(e.target.value)}
                                onBlur={() => setEditingAttr(null)} onKeyDown={(e) => e.key === "Enter" && setEditingAttr(null)} />
                            ) : value}
                          </dd>
                          <button className="icon-btn plain" type="button" aria-label={`Edit ${label.toLowerCase()}`} onClick={() => setEditingAttr(i)}><Ic n="edit" /></button>
                        </div>
                      );
                    })}
                  </dl>
                </>
              )}
              {error && <p className="sf-error">{error}</p>}
            </div>
            <div className="foot2">
              <button className="btn" type="button" onClick={confirmName} disabled={!name.trim() || repricing}>
                {repricing ? <><span className="sf-spin" /> Checking prices…</> : nameChanged ? <>Use this name<CtaArrow /></> : <>Yes, that&apos;s it<CtaArrow /></>}
              </button>
              <button className="btn ghost" type="button" onClick={() => setFixOpen((f) => !f)}>{fixOpen ? "Close" : "Fix it"}</button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="body2">
              <div className="context"><Sticker src={coverSrc} tilt={2} /><div className="info"><b>{shortName}</b><span>· {SPEED_INFO[speed].label}</span></div></div>
              <h1 className="q">What&apos;s your minimum?</h1>
              <p className="sub">The lowest price you&apos;d still be happy with.</p>
              <div className="stepper card">
                <button className="icon-btn" type="button" onClick={() => setMin(floor - STEP)} aria-label={`Lower by ${STEP} euro`}><Ic n="minus" /></button>
                <output key={`m${pulse}`} className={cx("price-big", pulse > 0 && "pulse")}>€{floor}</output>
                <button className="icon-btn" type="button" onClick={() => setMin(floor + STEP)} aria-label={`Raise by ${STEP} euro`}><Ic n="plus" /></button>
              </div>
              <Histo market={market} min={floor} goal={goalPrice} />
              <p className="sec">Optimise for</p>
              <div className="goalrow card pad" style={{ boxShadow: "var(--shadow-soft)", display: "block" }}>
                <div className="tabs" role="tablist" aria-label="Optimise for" style={{ marginBottom: 10 }}>
                  {(["fast", "best"] as Speed[]).map((s) => (
                    <button key={s} type="button" role="tab" aria-selected={speed === s} onClick={() => pickSpeed(s)}>{SPEED_INFO[s].label}</button>
                  ))}
                </div>
                <p className="muted small" style={{ margin: "0 0 14px" }}>{SPEED_INFO[speed].line}</p>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <b className="lbl">Goal</b>
                  <div className="stepper">
                    <button className="icon-btn" type="button" onClick={() => setGoal(goalPrice - STEP)} aria-label={`Lower goal by ${STEP} euro`}><Ic n="minus" /></button>
                    <output key={`g${pulse}`} className={cx("price-big", pulse > 0 && "pulse")}>€{goalPrice}</output>
                    <button className="icon-btn" type="button" onClick={() => setGoal(goalPrice + STEP)} aria-label={`Raise goal by ${STEP} euro`}><Ic n="plus" /></button>
                  </div>
                </div>
              </div>
            </div>
            <div className="foot2"><button className="btn" type="button" onClick={() => go(1)}>Next</button></div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="body2">
              <div className="context"><Sticker src={coverSrc} tilt={-3} /><div className="info"><b>{shortName}</b><span>· Never below €{floor}</span></div></div>
              <h1 className="q">How does it get to the buyer?</h1>
              <p className="sub">Poof plans the handover with the buyer.</p>
              <HandOpt checked icon="pin" title="Pickup" tag="Poof pick" desc="The buyer comes to you. Usual for big items.">
                {cityEdit ? (
                  <div className="field">
                    <label htmlFor="pickupCity">Postcode or city</label>
                    <input id="pickupCity" type="text" autoFocus value={city} onChange={(e) => setCity(e.target.value)}
                      onBlur={() => city.trim() && setCityEdit(false)} onKeyDown={(e) => e.key === "Enter" && city.trim() && setCityEdit(false)} />
                  </div>
                ) : (
                  <div className="row pickup-sum"><span>Pickup · {city || "…"}</span><button type="button" className="viewlink" onClick={() => setCityEdit(true)}>Change</button></div>
                )}
              </HandOpt>
              <HandOpt off icon="box" title="Shipping" tag="Soon" desc="You send it. Poof makes the label." />
              <HandOpt off icon="swap" title="Both" tag="Soon" desc="The buyer chooses. More buyers, a bit more to arrange." />
              {error && <p className="sf-error">{error}</p>}
            </div>
            <div className="foot2">
              <button className="btn" type="button" onClick={submit} disabled={busy}>
                {busy ? <><span className="sf-spin" /> Creating…</> : "Create my ad"}
              </button>
            </div>
          </>
        )}
      </div>
    </SfScreen>
  );
}

function HandOpt({ checked, off, icon, title, tag, desc, children }: {
  checked?: boolean; off?: boolean; icon: IconName; title: string; tag?: string; desc: string; children?: ReactNode;
}) {
  return (
    <div className={cx("option", checked && "checked", off && "off")}>
      <label>
        <input type="radio" name="hand" checked={!!checked} disabled={off} readOnly />
        <span className="grow">
          <b>{title}{tag && <> <span className="tag">{tag}</span></>}</b>
          <span className="small muted">{desc}</span>
        </span>
        <Ic n={icon} />
      </label>
      {children && <div className="more">{children}</div>}
    </div>
  );
}

/** Market histogram of the similar listings (prototype `.histo`), with the Min and Goal markers. */
function Histo({ market, min, goal }: { market: Market; min: number; goal: number }) {
  const prices = (market.comps ?? []).map((c) => c.price).filter((p) => p > 0);
  const lo = prices.length > 1 ? Math.min(...prices) : market.priceRange?.low;
  const hi = prices.length > 1 ? Math.max(...prices) : market.priceRange?.high;
  if (lo == null || hi == null || hi <= lo) return null;
  const n = market.compsCount ?? prices.length;
  const range = hi - lo;
  const BINS = 9;
  const counts = Array.from({ length: BINS }, () => 0);
  prices.forEach((p) => { counts[Math.min(BINS - 1, Math.max(0, Math.floor(((p - lo) / range) * BINS)))]++; });
  const peak = Math.max(1, ...counts);
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - lo) / range) * 100));
  const typical = market.priceRange?.mid;
  return (
    <>
      <p className="sec">{n ? `${n} similar listings sold for ${eur(lo)} to ${eur(hi)}` : `Similar listings sold for ${eur(lo)} to ${eur(hi)}`}</p>
      <div className="histo">
        <div className="marker" style={{ left: `${pct(min)}%` }}><span>Min</span></div>
        <div className="marker goal" style={{ left: `${pct(goal)}%` }}><span>Goal</span></div>
        {prices.length > 1 && counts.map((c, i) => (
          <i key={i} style={{ height: `${(c / peak) * 100}%` }} className={lo + ((i + 1) * range) / BINS <= min ? "below" : ""} />
        ))}
      </div>
      <div className="axis"><span>{eur(lo)}</span>{typical != null && <span>typical {eur(typical)}</span>}<span>{eur(hi)}</span></div>
    </>
  );
}

/** Poof at work (prototype renderWorking), driven by the item's real progress. Render it for status "writing". */
export function PoofAtWork({ item }: { item: Item }) {
  const name = item.recognition?.name ?? item.title ?? "your item";
  const n = item.compsCount ?? item.comps?.length ?? 0;
  const done = [!!item.recognition?.name, n > 0, item.askPrice != null, item.status === "ad_ready" || !!item.description];
  const firstOpen = done.findIndex((d) => !d);
  const state = (i: number) => (done[i] ? "done" : i === firstOpen ? "running" : "next");
  const steps = [
    `Recognised your ${name}`,
    n ? `Found ${n} similar listings` : "Finding similar listings",
    item.askPrice != null ? `Priced at €${item.askPrice}` : "Pricing it",
    done[3] ? "Wrote your ad" : "Writing your ad",
  ];
  return (
    <SfScreen>
      <div className="layer">
        <div className="top2"><div className="grow" /></div>
        <div className="body2" style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
          <div className="row" style={{ marginBottom: 22 }}>
            <Sticker src={item.photos[item.coverIndex ?? 0] ?? item.photos[0]} tilt={-3} size={56} />
            <div className="grow"><p className="eyebrow">{name}</p><h1 className="q" style={{ margin: 0, fontSize: 24 }}>Poof is on it</h1></div>
          </div>
          <ol className="steps card divided" style={{ boxShadow: "var(--shadow-soft)" }}>
            {steps.map((t, i) => (
              <li key={i} className="step" data-state={state(i)}>
                <span className="st-ico"><Ic n="check" /></span>
                <div className="grow"><b>{t}</b></div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </SfScreen>
  );
}

/* ------------------------------------------------------------------ shared with other screens */

export function Pencil({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx("size-4 shrink-0 text-mute", className)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" />
    </svg>
  );
}

export function RangeBar({ low, high, mark, markLabel = "your minimum" }: { low: number; high: number; mark: number; markLabel?: string }) {
  const lo = Math.min(low, mark) - (high - low) * 0.25;
  const hi = Math.max(high, mark) + (high - low) * 0.25;
  const pct = (v: number) => `${((v - lo) / (hi - lo || 1)) * 100}%`;
  const under = mark < low;
  return (
    <div className="relative mt-10 h-12">
      <div className="absolute inset-x-0 top-3 h-3 rounded-[4px] bg-line" />
      <div className="absolute top-3 h-3 rounded-[4px] bg-lime" style={{ left: pct(low), width: `calc(${pct(high)} - ${pct(low)})` }} />
      <span className="absolute top-8 -translate-x-1/2 text-[12px] text-moss tabular" style={{ left: pct(low) }}>{eur(low)}</span>
      <span className="absolute top-8 -translate-x-1/2 text-[12px] text-moss tabular" style={{ left: pct(high) }}>{eur(high)}</span>
      <div className="absolute -top-7 bottom-4 w-0 transition-[left] duration-300" style={{ left: pct(mark) }}>
        <span className="absolute -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-2.5 py-[3px] text-[12px] font-bold text-white">
          {markLabel}
        </span>
        <span className={cx("absolute top-5 h-[28px] w-[2px] -translate-x-1/2", under ? "bg-alert" : "bg-ink")} />
      </div>
    </div>
  );
}
