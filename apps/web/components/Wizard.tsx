"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { details, rename } from "@/lib/api";
import { CONDITIONS, CONDITION_NL, GOALS, attrText, chipFor, eur, type ConditionChip } from "@/lib/format";
import type { Goal, Item } from "@/lib/types";
import { BottomAction, Button, Eyebrow, ICON_BTN, Segmented, Soon, cx } from "./ui";

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
    <div className="pb-36">
      {/* Progress */}
      <div className="flex items-center gap-2.5 pb-3">
        {step > 0 ? (
          <button onClick={() => setStep((s) => s - 1)} aria-label="Back" className={ICON_BTN}>
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
        ) : (
          <Link href="/" aria-label="Close" className={ICON_BTN}>
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </Link>
        )}
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-line">
          <span className="block h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${((step + 1) / 4) * 100}%` }} />
        </span>
        <span className="whitespace-nowrap text-[13px] text-moss tabular">{step + 1} of 4</span>
      </div>

      {step > 0 && (
        <div className="mb-4 mt-1 flex items-center gap-2 rounded-[14px] bg-card px-2.5 py-1.5 shadow-soft">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {item.photos[cover] && <img src={item.photos[cover]} alt="" className="size-7 shrink-0 rounded-[8px] object-cover" />}
          <span className="flex min-w-0 items-baseline gap-1.5 text-[13px]">
            <b className="truncate font-bold">{name.trim() || "Your item"}</b>
            {step > 1 && <span className="whitespace-nowrap text-moss">· {GOALS.find((g) => g.value === goal)?.label}</span>}
          </span>
        </div>
      )}

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

      {error && <p className="mt-4 rounded-[20px] bg-alert-soft p-4 text-[14px] text-alert">{error}</p>}

      <BottomAction>
        {step === 0 && (
          <div className="flex flex-col items-stretch gap-1">
            <Button onClick={confirmName} disabled={!name.trim() || repricing} className="w-full">
              {repricing ? <><span className="size-5 animate-spin rounded-full border-[3px] border-lime/30 border-t-lime" /> Checking prices…</>
                : name.trim().toLowerCase() !== pricedName.toLowerCase() ? <>Use this name <Arrow /></> : <>Yes, that&apos;s it <Arrow /></>}
            </Button>
            {/* Fixed-height slot so the main button never moves when this link appears (a moving button loses the tap). */}
            <div className="flex h-11 items-center justify-center">
              {!fixing && !repricing && <button onClick={() => setFixing(true)} className="min-h-11 px-3 text-[15px] font-semibold text-ink underline underline-offset-4">Not right? Fix it</button>}
            </div>
          </div>
        )}
        {(step === 1 || step === 2) && <Button onClick={next} className="w-full">Next</Button>}
        {step === 3 && (
          <Button onClick={submit} disabled={busy} className="w-full">
            {busy ? <><span className="size-5 animate-spin rounded-full border-[3px] border-lime/30 border-t-lime" /> Creating…</> : <>Create my ad <Arrow /></>}
          </Button>
        )}
      </BottomAction>
    </div>
  );
}

function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="text-[26px] font-extrabold leading-[1.2] tracking-[-0.02em]">{children}</h2>
      {sub && <p className="mt-1.5 text-[15px] text-moss">{sub}</p>}
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
      <Title sub="Poof recognised it from your photos.">Is this it?</Title>

      <div className="relative h-[230px] overflow-hidden rounded-[20px] bg-limetint">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {item.photos[p.cover] && <img key={p.cover} src={item.photos[p.cover]} alt="" className="size-full animate-fade object-cover" />}
        <span className="absolute bottom-2 right-2 rounded-full bg-card px-2 py-0.5 text-[12px] font-semibold shadow-soft">Cover</span>
      </div>
      {item.photos.length > 1 && (
        <div className="mt-2 flex gap-2">
          {item.photos.map((ph, i) => (
            <button
              key={i}
              onClick={() => p.setCover(i)}
              aria-label={`Use photo ${i + 1} as cover`}
              aria-pressed={i === p.cover}
              className={cx("h-[58px] flex-1 overflow-hidden rounded-[10px] transition", i === p.cover ? "ring-2 ring-ink" : "opacity-85")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ph} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {item.photos.length > 1 && <p className="mt-2 text-[13px] text-moss">Tap a photo to make it the cover.</p>}

      <section className="mt-[18px]">
        <p className="text-[13px] font-semibold text-moss">What it is</p>
        {p.fixing ? (
          <input
            autoFocus
            value={p.name}
            onChange={(e) => p.setName(e.target.value)}
            onBlur={() => p.name.trim() && p.setFixing(false)}
            onKeyDown={(e) => e.key === "Enter" && p.name.trim() && p.setFixing(false)}
            placeholder="What is it? e.g. IKEA POÄNG"
            className="mt-1 min-h-12 w-full rounded-[12px] border-2 border-ink bg-card px-3.5 py-2 text-[20px] font-extrabold tracking-[-0.02em] outline-none"
          />
        ) : (
          <button onClick={() => p.setFixing(true)} className="mt-0.5 text-left">
            <span className="text-[24px] font-extrabold leading-tight tracking-[-0.02em]">{p.name}</span>
            {category && <span className="mt-0.5 block text-[15px] text-moss">{category}</span>}
          </button>
        )}
      </section>

      <section className="mt-5">
        <Eyebrow className="mb-2.5">Condition</Eyebrow>
        <div className="flex flex-wrap gap-2">
          {CONDITIONS.map((c) => (
            <button
              key={c}
              onClick={() => p.setCondition(c)}
              aria-pressed={c === p.condition}
              className={cx("min-h-11 rounded-full px-[18px] text-[15px] font-semibold transition active:scale-95",
                c === p.condition ? "bg-ink text-white" : "bg-card text-ink shadow-soft")}
            >
              {c}
            </button>
          ))}
        </div>
      </section>

      {p.attrs.length > 0 && (
        <section className="mt-5">
          <Eyebrow className="mb-2.5">Details</Eyebrow>
          <ul className="overflow-hidden rounded-[20px] bg-card shadow-soft">
            {p.attrs.map((a, i) => (
              <li key={i} className="border-b border-line last:border-0">
                {editing === i ? (
                  <input
                    autoFocus
                    value={a}
                    onChange={(e) => p.setAttrs(p.attrs.map((x, j) => (j === i ? e.target.value : x)))}
                    onBlur={() => setEditing(null)}
                    onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
                    className="min-h-[52px] w-full bg-limetint px-4 py-3 text-[15px] outline-none"
                  />
                ) : (
                  <button onClick={() => setEditing(i)} className="flex min-h-[52px] w-full items-center gap-2 px-4 py-3 text-left text-[15px]">
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
      <span className="text-moss">{text.slice(0, i)}</span>
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
      <Title sub="Faster means a slightly lower price.">When should it be gone?</Title>
      <Segmented<Goal> value={goal} onChange={setGoal} options={GOALS.map((x) => ({ value: x.value, label: x.label }))} />
      <p key={goal} className="mb-2 mt-[18px] animate-fade text-[18px] font-bold leading-snug">{g.hint}</p>
      <div className="space-y-3 rounded-[20px] bg-card p-4 shadow-soft">
        <Meter label="Speed" value={speed} tone="bg-ink" />
        <Meter label="Price" value={price} tone="bg-lime" />
      </div>
      <p className="mt-3 text-[13px] text-moss">Poof sets the price and lowers it step by step to hit this. You see the plan before anything goes online.</p>
    </div>
  );
}

function Meter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 text-[13px] font-bold text-moss">{label}</span>
      <div className="flex flex-1 gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={cx("h-2.5 flex-1 rounded-full transition-colors duration-300", i <= value ? tone : "bg-line")} />
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
      <Title sub="The lowest price you'd still be happy with.">What&apos;s your minimum?</Title>
      <div className="flex items-center justify-between gap-3 rounded-[20px] bg-card p-3.5 shadow-soft">
        <Step label="Lower" onClick={() => setFloor(Math.max(5, floor - 5))} disabled={floor <= 5}>
          <path d="M5 12h14" />
        </Step>
        <span key={floor} className="tabular animate-pop text-[44px] font-extrabold leading-none tracking-[-0.02em]">€{floor}</span>
        <Step label="Higher" onClick={() => setFloor(floor + 5)}>
          <path d="M5 12h14" /><path d="M12 5v14" />
        </Step>
      </div>

      {r && (
        <div className="mt-5">
          <p className="text-[12px] font-bold text-moss">
            Similar ones sell for {eur(r.low)} to {eur(r.high)}
          </p>
          <RangeBar low={r.low} high={r.high} mark={floor} />
        </div>
      )}

      <div className="mt-[18px] flex items-center gap-3 rounded-[16px] bg-limetint px-4 py-3.5">
        <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" />
        </svg>
        <p className="font-bold">Poof never accepts less.</p>
      </div>
    </div>
  );
}

function Step({ children, label, onClick, disabled }: { children: ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} className="grid size-[52px] shrink-0 place-items-center rounded-full bg-card shadow-soft transition active:scale-90 disabled:opacity-30">
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">{children}</svg>
    </button>
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

// ---------------------------------------------------------------- 05

function Delivery({ city, setCity }: { city: string; setCity: (s: string) => void }) {
  return (
    <div>
      <Title>How does it get to the buyer?</Title>
      <div className="space-y-2.5">
        <div className="rounded-[20px] bg-card p-4 shadow-[0_0_0_2px_var(--color-ink)]">
          <div className="flex items-center gap-3">
            <span className="grid size-[22px] place-items-center rounded-full bg-ink"><span className="size-2 rounded-full bg-white" /></span>
            <span className="font-bold">Pickup</span>
          </div>
          <label className="mt-3 block pl-[34px]">
            <span className="mb-1 block text-[13px] font-semibold text-moss">Postcode or city</span>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="min-h-11 w-full rounded-[12px] border border-line bg-card px-3.5 text-[15px] font-semibold outline-none focus:border-ink"
            />
          </label>
          <p className="mt-2 pl-[34px] text-[13px] text-moss">The exact address is only shared with the buyer once there&apos;s a deal.</p>
        </div>
        {["Shipping", "Both"].map((o) => (
          <div key={o} aria-disabled className="flex items-center gap-3 rounded-[20px] bg-card/60 p-4 text-moss shadow-soft">
            <span className="size-[22px] rounded-full border-2 border-line" />
            <span className="font-bold">{o}</span>
            <Soon className="ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
