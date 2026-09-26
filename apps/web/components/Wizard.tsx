"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { details, rename } from "@/lib/api";
import { CONDITIONS, CONDITION_NL, GOALS, attrText, chipFor, eur, type ConditionChip } from "@/lib/format";
import type { Goal, Item } from "@/lib/types";
import { BottomAction, Button, Eyebrow, Segmented, Soon, cx } from "./ui";

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

/** 02–05: a local wizard over the same item. Only the last button calls the API. */
export function Wizard({ item, onSubmitted }: { item: Item; onSubmitted: (patch: Partial<Item>) => void }) {
  const rec = item.recognition ?? {};
  const [step, setStep] = useState(0);
  const [cover, setCover] = useState(item.coverIndex ?? 0);
  const [name, setName] = useState(rec.name ?? item.title ?? "");
  const [fixing, setFixing] = useState(!rec.name && !item.title);
  const [condition, setCondition] = useState<ConditionChip>(chipFor(rec.condition ?? item.condition));
  const [attrs, setAttrs] = useState<string[]>((rec.attributes ?? []).map(attrText).filter(Boolean));
  const [goal, setGoal] = useState<Goal>("week");
  const [floor, setFloor] = useState(() => round5(item.priceRange?.low ?? 70));
  const [city, setCity] = useState("Amsterdam");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Market picture: from intake, or re-checked after the owner corrected the name.
  const [market, setMarket] = useState<Pick<Item, "priceRange" | "compsCount" | "comps">>({});
  const [pricedName, setPricedName] = useState((rec.name ?? item.title ?? "").trim());
  const [repricing, setRepricing] = useState(false);
  const view: Item = { ...item, ...market };

  const next = () => { setStep((s) => s + 1); window.scrollTo({ top: 0 }); };

  /** Step 02 → 03. If the name was corrected, price the corrected product first. */
  async function confirmName() {
    const n = name.trim();
    if (!n) return;
    if (n.toLowerCase() === pricedName.toLowerCase()) return next();
    setRepricing(true);
    setError(null);
    try {
      const r = await rename(item.id, n);
      setMarket({ priceRange: r.priceRange ?? undefined, compsCount: r.compsCount, comps: r.comps });
      if (r.priceRange?.low) setFloor(round5(r.priceRange.low));
      setPricedName(n);
      next();
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
    const body = {
      itemId: item.id, name: name.trim() || "Item", condition: CONDITION_NL[condition], goal, floorPrice: floor,
      delivery: "pickup" as const, pickupCity: city.trim() || "Amsterdam",
      coverIndex: cover, conditionLabel: condition, attributes: attrs,
    };
    try {
      await details(body);
      onSubmitted({ status: "writing", goal, floorPrice: floor, coverIndex: cover, pickupCity: body.pickupCity, recognition: { ...rec, name: body.name } });
    } catch (e) {
      setError(`Couldn't create the ad: ${(e as Error).message}`);
      setBusy(false);
    }
  }

  return (
    <div className="pb-28">
      {/* Progress */}
      <div className="flex items-center gap-3 pb-5">
        {step > 0 ? (
          <button onClick={() => setStep((s) => s - 1)} aria-label="Back" className="grid size-10 shrink-0 place-items-center rounded-full bg-card ring-1 ring-line transition active:scale-95">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
        ) : (
          <Link href="/" aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-full bg-card ring-1 ring-line transition active:scale-95">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </Link>
        )}
        <div className="flex flex-1 gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
              <span className={cx("block h-full origin-left rounded-full bg-cobalt transition-transform duration-500", i <= step ? "scale-x-100" : "scale-x-0")} />
            </span>
          ))}
        </div>
        <span className="font-mono text-[12px] font-bold text-mute">{step + 1}/4</span>
      </div>

      <div key={step} className="animate-rise">
        {step === 0 && (
          <IsThisIt
            item={item} cover={cover} setCover={setCover} name={name} setName={setName}
            fixing={fixing} setFixing={setFixing} condition={condition} setCondition={setCondition}
            attrs={attrs} setAttrs={setAttrs}
          />
        )}
        {step === 1 && <WhenGone goal={goal} setGoal={setGoal} />}
        {step === 2 && <Minimum item={view} floor={floor} setFloor={setFloor} />}
        {step === 3 && <Delivery city={city} setCity={setCity} />}
      </div>

      {error && <p className="mt-4 rounded-2xl bg-alert-soft p-4 text-[14px] text-alert">{error}</p>}

      <BottomAction>
        {step === 0 && (
          <div className="flex items-center gap-3">
            <Button onClick={confirmName} disabled={!name.trim() || repricing} className="flex-1 !py-4 !text-[18px]">
              {repricing ? <><span className="size-5 animate-spin rounded-full border-[3px] border-white/30 border-t-white" /> Checking prices…</>
                : name.trim().toLowerCase() !== pricedName.toLowerCase() ? "Use this name" : "Yes, that's it"}
            </Button>
            {!fixing && !repricing && <button onClick={() => setFixing(true)} className="px-2 text-[15px] font-semibold text-cobalt">Not right? Fix it</button>}
          </div>
        )}
        {(step === 1 || step === 2) && <Button onClick={next} className="w-full !py-4 !text-[18px]">Next</Button>}
        {step === 3 && (
          <Button onClick={submit} disabled={busy} className="w-full !py-4 !text-[18px]">
            {busy ? <><span className="size-5 animate-spin rounded-full border-[3px] border-white/30 border-t-white" /> Creating…</> : "Create my ad"}
          </Button>
        )}
      </BottomAction>
    </div>
  );
}

function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-5 px-1">
      <h2 className="font-display text-[38px] font-extrabold leading-[0.95] tracking-[-0.045em]">{children}</h2>
      {sub && <p className="mt-2 text-[15px] text-ink-2">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- 02

function IsThisIt(p: {
  item: Item; cover: number; setCover: (n: number) => void;
  name: string; setName: (s: string) => void; fixing: boolean; setFixing: (b: boolean) => void;
  condition: ConditionChip; setCondition: (c: ConditionChip) => void;
  attrs: string[]; setAttrs: (a: string[]) => void;
}) {
  const { item } = p;
  const [editing, setEditing] = useState<number | null>(null);
  const category = item.recognition?.category ?? item.category?.split(" › ").at(-1);
  return (
    <div>
      <Title>Is this it?</Title>

      <div className="relative aspect-[4/3.2] overflow-hidden rounded-[28px] bg-ink">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {item.photos[p.cover] && <img key={p.cover} src={item.photos[p.cover]} alt="" className="size-full animate-fade object-cover" />}
        <span className="absolute left-3 top-3 rounded-full bg-ink/70 px-2.5 py-1 text-[12px] font-semibold text-white backdrop-blur">Cover</span>
        {item.photos.length > 1 && (
          <div className="absolute inset-x-3 bottom-3 flex gap-2">
            {item.photos.map((ph, i) => (
              <button
                key={i}
                onClick={() => p.setCover(i)}
                aria-label={`Use photo ${i + 1} as cover`}
                className={cx("size-12 overflow-hidden rounded-xl ring-2 transition", i === p.cover ? "ring-tag" : "ring-white/70 opacity-80")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ph} alt="" className="size-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
      {item.photos.length > 1 && <p className="mt-2 px-1 text-[13px] text-mute">Tap a photo to make it the cover.</p>}

      <section className="mt-5 px-1">
        <Eyebrow>What it is</Eyebrow>
        {p.fixing ? (
          <input
            autoFocus
            value={p.name}
            onChange={(e) => p.setName(e.target.value)}
            onBlur={() => p.name.trim() && p.setFixing(false)}
            onKeyDown={(e) => e.key === "Enter" && p.name.trim() && p.setFixing(false)}
            placeholder="What is it? e.g. IKEA POÄNG"
            className="mt-1 w-full rounded-2xl bg-card px-4 py-3 font-display text-[24px] font-bold tracking-[-0.03em] outline-none ring-2 ring-cobalt"
          />
        ) : (
          <button onClick={() => p.setFixing(true)} className="mt-1 text-left">
            <span className="font-display text-[30px] font-extrabold leading-none tracking-[-0.04em]">{p.name}</span>
            {category && <span className="ml-2 text-[16px] text-mute">· {category}</span>}
          </button>
        )}
      </section>

      <section className="mt-5 px-1">
        <Eyebrow className="mb-2">Condition</Eyebrow>
        <div className="flex flex-wrap gap-2">
          {CONDITIONS.map((c) => (
            <button
              key={c}
              onClick={() => p.setCondition(c)}
              className={cx("rounded-full px-4 py-2 text-[15px] font-semibold transition active:scale-95",
                c === p.condition ? "bg-ink text-white" : "bg-card text-ink ring-1 ring-line")}
            >
              {c}
            </button>
          ))}
        </div>
      </section>

      {p.attrs.length > 0 && (
        <section className="mt-5">
          <Eyebrow className="mb-2 px-1">Details</Eyebrow>
          <ul className="overflow-hidden rounded-[22px] bg-card ring-1 ring-line/60">
            {p.attrs.map((a, i) => (
              <li key={i} className="border-b border-line/70 last:border-0">
                {editing === i ? (
                  <input
                    autoFocus
                    value={a}
                    onChange={(e) => p.setAttrs(p.attrs.map((x, j) => (j === i ? e.target.value : x)))}
                    onBlur={() => setEditing(null)}
                    onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
                    className="w-full bg-cobalt-soft/50 px-4 py-3 text-[15px] outline-none"
                  />
                ) : (
                  <button onClick={() => setEditing(i)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-[15px]">
                    <AttrText text={a} />
                    <Pencil />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function AttrText({ text }: { text: string }) {
  const i = text.indexOf(":");
  if (i < 0) return <span className="flex-1">{text}</span>;
  return (
    <span className="flex flex-1 justify-between gap-3">
      <span className="text-mute">{text.slice(0, i)}</span>
      <span className="text-right font-semibold">{text.slice(i + 1).trim()}</span>
    </span>
  );
}

export function Pencil({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx("size-4 shrink-0 text-mute", className)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" />
    </svg>
  );
}

// ---------------------------------------------------------------- 03

const SPEED: Record<Goal, [number, number]> = { week: [5, 3], two_weeks: [4, 4], no_rush: [2, 5] };

function WhenGone({ goal, setGoal }: { goal: Goal; setGoal: (g: Goal) => void }) {
  const g = GOALS.find((x) => x.value === goal)!;
  const [speed, price] = SPEED[goal];
  return (
    <div>
      <Title>When should it be gone?</Title>
      <Segmented<Goal> value={goal} onChange={setGoal} options={GOALS.map((x) => ({ value: x.value, label: x.label }))} />
      <p key={goal} className="mt-4 animate-fade px-1 font-display text-[22px] font-bold leading-tight tracking-[-0.02em]">{g.hint}</p>
      <div className="mt-6 space-y-3 rounded-[24px] bg-card p-4 ring-1 ring-line/60">
        <Meter label="Speed" value={speed} tone="bg-cobalt" />
        <Meter label="Price" value={price} tone="bg-tag" />
      </div>
      <p className="mt-3 px-1 text-[13.5px] text-mute">Your agent sets the price and lowers it step by step to hit this. You see the plan before anything goes online.</p>
    </div>
  );
}

function Meter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-mute">{label}</span>
      <div className="flex flex-1 gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={cx("h-3 flex-1 rounded-full transition-colors duration-300", i <= value ? tone : "bg-line")} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 04

function Minimum({ item, floor, setFloor }: { item: Item; floor: number; setFloor: (n: number) => void }) {
  const r = item.priceRange;
  return (
    <div>
      <Title>What&apos;s your minimum?</Title>
      <div className="flex items-center justify-between gap-3 rounded-[28px] bg-card px-4 py-6 ring-1 ring-line/60">
        <Step label="Lower" onClick={() => setFloor(Math.max(5, floor - 5))} disabled={floor <= 5}>
          <path d="M6 12h12" />
        </Step>
        <span key={floor} className="tabular animate-pop font-mono text-[64px] font-bold leading-none tracking-[-0.05em]">€{floor}</span>
        <Step label="Higher" onClick={() => setFloor(floor + 5)}>
          <path d="M12 6v12M6 12h12" />
        </Step>
      </div>

      {r && (
        <div className="mt-5 px-1">
          <p className="text-[15px] text-ink-2">
            Similar ones sell for <b className="font-mono text-ink">{eur(r.low)}</b> to <b className="font-mono text-ink">{eur(r.high)}</b>
          </p>
          <RangeBar low={r.low} high={r.high} mark={floor} />
        </div>
      )}

      <div className="mt-6 flex items-center gap-3 rounded-[22px] bg-ink px-4 py-4 text-white">
        <svg viewBox="0 0 24 24" className="size-7 shrink-0 text-tag" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <path d="M12 3l7 3v6c0 4.2-3 7.4-7 9-4-1.6-7-4.8-7-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" strokeLinecap="round" />
        </svg>
        <p className="font-display text-[19px] font-bold leading-tight tracking-[-0.02em]">Your agent never accepts less.</p>
      </div>
    </div>
  );
}

function Step({ children, label, onClick, disabled }: { children: ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} className="grid size-14 shrink-0 place-items-center rounded-full bg-paper transition active:scale-90 disabled:opacity-30">
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">{children}</svg>
    </button>
  );
}

export function RangeBar({ low, high, mark, markLabel = "your minimum" }: { low: number; high: number; mark: number; markLabel?: string }) {
  const lo = Math.min(low, mark) - (high - low) * 0.25;
  const hi = Math.max(high, mark) + (high - low) * 0.25;
  const pct = (v: number) => `${((v - lo) / (hi - lo || 1)) * 100}%`;
  const under = mark < low;
  return (
    <div className="relative mt-9 h-12">
      <div className="absolute inset-x-0 top-3 h-2.5 rounded-full bg-line" />
      <div className="absolute top-3 h-2.5 rounded-full bg-cobalt" style={{ left: pct(low), width: `calc(${pct(high)} - ${pct(low)})` }} />
      <span className="absolute top-7 -translate-x-1/2 font-mono text-[11px] font-bold text-mute" style={{ left: pct(low) }}>{eur(low)}</span>
      <span className="absolute top-7 -translate-x-1/2 font-mono text-[11px] font-bold text-mute" style={{ left: pct(high) }}>{eur(high)}</span>
      <div className="absolute -top-6 bottom-4 w-0 transition-[left] duration-300" style={{ left: pct(mark) }}>
        <span className="absolute -translate-x-1/2 whitespace-nowrap rounded-full bg-tag px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink">
          {markLabel}
        </span>
        <span className={cx("absolute top-5 h-[26px] w-[3px] -translate-x-1/2 rounded-full", under ? "bg-alert" : "bg-ink")} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 05

function Delivery({ city, setCity }: { city: string; setCity: (s: string) => void }) {
  return (
    <div>
      <Title>How does it get to the buyer?</Title>
      <div className="space-y-2.5">
        <div className="rounded-[24px] bg-card p-4 ring-2 ring-cobalt">
          <div className="flex items-center gap-3">
            <span className="grid size-6 place-items-center rounded-full bg-cobalt"><span className="size-2.5 rounded-full bg-white" /></span>
            <span className="font-display text-[20px] font-bold tracking-[-0.02em]">Pickup</span>
          </div>
          <label className="mt-3 block">
            <span className="mb-1.5 block px-1 text-[13px] text-mute">Postcode or city</span>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full rounded-2xl bg-paper px-4 py-3 text-[17px] font-semibold outline-none focus:ring-2 focus:ring-cobalt"
            />
          </label>
          <p className="mt-2 px-1 text-[13px] text-mute">The exact address is only shared with the buyer once there&apos;s a deal.</p>
        </div>
        {["Shipping", "Both"].map((o) => (
          <div key={o} aria-disabled className="flex items-center gap-3 rounded-[24px] bg-card/60 p-4 text-mute ring-1 ring-line/60">
            <span className="size-6 rounded-full border-2 border-line" />
            <span className="font-display text-[20px] font-bold tracking-[-0.02em]">{o}</span>
            <Soon className="ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
