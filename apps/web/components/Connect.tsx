"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CONSENT, PICKUP_HOURS, getAccount, newPairCode, phoneLoginStatus, startPhoneLogin, stopPhoneLogin, type Account, type PairCode, type PhoneLogin, type Profile } from "@/lib/account";
import { Button, Eyebrow, PlatformLogo, Tick, cx } from "./ui";

/** Connect Marktplaats: log in right here (secure browser streamed into the app), or the Poof Connector on a laptop. */
export function ConnectMarktplaats({
  onConnected, onSkip, skipLabel = "Skip for now", compact,
}: { onConnected: (a: Account) => void; onSkip?: () => void; skipLabel?: string; compact?: boolean }) {
  const [code, setCode] = useState<PairCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<Account | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const fetching = useRef(false);

  // Code: fetch on mount and again once it expires.
  useEffect(() => {
    if (connected) return;
    const expired = !code || new Date(code.expiresAt).getTime() <= now;
    if (!expired || fetching.current) return;
    fetching.current = true;
    newPairCode()
      .then((c) => { setCode(c); setError(null); })
      .catch((e: Error) => setError(e.message))
      .finally(() => { fetching.current = false; });
  }, [code, now, connected]);

  // Tick + poll the account every 2 s.
  useEffect(() => {
    if (connected) return;
    const t = setInterval(() => {
      setNow(Date.now());
      getAccount().then((a) => { if (a?.mpConnected) setConnected(a); }).catch(() => {});
    }, 2000);
    return () => clearInterval(t);
  }, [connected]);

  if (connected) {
    return (
      <div className="animate-rise space-y-5">
        <div className="flex flex-col items-center rounded-[20px] bg-limetint px-6 py-8 text-center text-ink">
          <span className="grid size-16 animate-pop place-items-center rounded-full bg-ink text-lime"><Tick className="size-9" /></span>
          <p className="mt-4 text-[26px] font-extrabold leading-tight tracking-[-0.02em]">Connected as <span className="pb">{connected.mpName ?? "you"}</span></p>
          <p className="mt-2 text-[15px] text-moss">Poof can now post, answer and take ads down on Marktplaats.</p>
        </div>
        <Button onClick={() => onConnected(connected)} className="w-full">Continue</Button>
      </div>
    );
  }

  const left = code ? Math.max(0, Math.round((new Date(code.expiresAt).getTime() - now) / 1000)) : 0;
  const digits = (code?.code ?? "").split("");

  return (
    <div className="space-y-4">
      <PhoneLoginCard />

      <Eyebrow className="px-1 pt-2">Or on a laptop, with the Poof Connector</Eyebrow>
      <div className="rounded-[20px] bg-ink px-5 pb-5 pt-4 text-white shadow-float">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-[13px] font-bold text-lime">
            <PlatformLogo platform="marktplaats" className="!size-5" /> Your code
          </p>
          {code && <p className="font-mono text-[12px] font-bold text-white/60">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</p>}
        </div>
        <div className="mt-3 flex justify-between gap-1.5" aria-label={code ? `Code ${code.code}` : "Getting a code"}>
          {(digits.length ? digits : Array(6).fill("")).map((d, i) => (
            <span
              key={`${code?.code}-${i}`}
              className={cx("grid h-[62px] flex-1 place-items-center rounded-[12px] bg-white/12 font-mono text-[32px] font-extrabold text-lime", i === 3 && "ml-2", d ? "animate-pop" : "skeleton !bg-white/10 opacity-40")}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {d}
            </span>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-2 text-[13.5px] text-white/70">
          <span className="relative grid size-3 place-items-center">
            <span className="absolute size-3 animate-ping rounded-full bg-lime/50" />
            <span className="size-1.5 rounded-full bg-lime" />
          </span>
          Waiting for the Poof Connector…
        </p>
      </div>

      {error && <p className="rounded-[20px] bg-alert-soft p-3 text-[14px] text-alert">Couldn&apos;t get a code: {error}</p>}

      <section>
        <ol className="overflow-hidden rounded-[20px] bg-card shadow-soft">
          {[
            <>Install <Link href="/connector" className="font-bold text-ink underline underline-offset-2">Poof Connector</Link> in Chrome</>,
            <>Log in to <b>marktplaats.nl</b> as usual</>,
            <>Open Poof Connector, enter this code and tap <b>Allow</b></>,
          ].map((t, i) => (
            <li key={i} className="flex items-center gap-3 border-b border-line px-4 py-3.5 last:border-0">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-lime text-[13px] font-extrabold text-ink">{i + 1}</span>
              <span className="text-[15px] leading-snug">{t}</span>
            </li>
          ))}
        </ol>
      </section>

      {!compact && <Consent />}

      {onSkip && (
        <button type="button" onClick={onSkip} className="btn ghost">
          {skipLabel}
        </button>
      )}
    </div>
  );
}

/** Opens a Marktplaats login in CloakBrowser on Apify, shown full-screen in an iframe. The actor links the session itself;
 *  the account poll in ConnectMarktplaats then flips to "Connected" and this unmounts. */
function PhoneLoginCard() {
  const [login, setLogin] = useState<PhoneLogin | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!login || url) return;
    let stop = false;
    const started = Date.now();
    const tick = async () => {
      if (stop) return;
      try {
        const s = await phoneLoginStatus(login);
        if (s.state === "ready" && s.url) { setUrl(s.url); setBusy(false); return; }
        if (s.state === "ended") { setError(s.message || "The secure browser stopped. Try again."); setBusy(false); setLogin(null); return; }
      } catch { /* keep polling */ }
      if (Date.now() - started > 120_000) { setError("The secure browser took too long to start. Try again."); setBusy(false); setLogin(null); return; }
      setTimeout(tick, 2000);
    };
    tick();
    return () => { stop = true; };
  }, [login, url]);

  const start = () => {
    setBusy(true); setError(null); setUrl(null);
    startPhoneLogin().then(setLogin).catch((e: Error) => { setError(e.message); setBusy(false); });
  };

  return (
    <section className="card pad" style={{ boxShadow: "var(--shadow-soft)" }}>
      <p className="flex items-center gap-2 text-[17px] font-bold">
        <PlatformLogo platform="marktplaats" className="!size-8" /> On this phone
      </p>
      <p className="mt-2 text-[15px] leading-snug text-moss">
        Log in to Marktplaats in a secure window. You type your password and SMS code yourself; Poof never sees them.
      </p>
      <Button onClick={start} disabled={busy} className="mt-4 w-full">
        {busy ? "Opening a secure browser… (~30 s)" : "Log in to Marktplaats"}
      </Button>
      {error && <p className="mt-3 rounded-[20px] bg-alert-soft p-3 text-[14px] text-alert">{error}</p>}
      {url && createPortal(
        <div className="fixed inset-0 z-[100] flex flex-col bg-page">
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-[13px] font-semibold text-moss">Secure Marktplaats login</span>
            <button onClick={() => { if (login) stopPhoneLogin(login); setUrl(null); setLogin(null); }} type="button" className="btn small">Close</button>
          </div>
          <iframe src={url} title="Marktplaats login" className="w-full flex-1 border-0" allow="clipboard-read; clipboard-write" />
        </div>,
        document.body,
      )}
    </section>
  );
}

export function Consent({ className }: { className?: string }) {
  return (
    <section className={cx("rounded-[16px] bg-limetint px-4 py-3.5", className)}>
      <p className="flex items-center gap-2 text-[14px] font-bold">
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></svg>
        What you&apos;re allowing
      </p>
      <ul className="mt-2 space-y-1.5">
        {CONSENT.map((c) => (
          <li key={c} className="flex gap-2 text-[13.5px] leading-snug text-moss">
            <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink/50" />
            {c}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Name + pickup city / address / hours. */
export function ProfileFields({ value, onChange, showName = true }: { value: Profile; onChange: (p: Profile) => void; showName?: boolean }) {
  const hours = value.pickupHours ?? [];
  const toggle = (h: string) => onChange({ ...value, pickupHours: hours.includes(h) ? hours.filter((x) => x !== h) : [...hours, h] });
  return (
    <div className="space-y-4">
      {showName && (
        <Field label="Your name">
          <input value={value.name ?? ""} onChange={(e) => onChange({ ...value, name: e.target.value })} autoComplete="given-name" placeholder="e.g. Aryan" className={INPUT} />
        </Field>
      )}
      <Field label="Pickup city">
        <input value={value.pickupCity ?? ""} onChange={(e) => onChange({ ...value, pickupCity: e.target.value })} autoComplete="address-level2" placeholder="Amsterdam" className={INPUT} />
      </Field>
      <Field label="Pickup address" hint="Only shared with a buyer after a deal.">
        <input value={value.pickupAddress ?? ""} onChange={(e) => onChange({ ...value, pickupAddress: e.target.value })} autoComplete="street-address" placeholder="Street and number" className={INPUT} />
      </Field>
      <Field label="Buyers can pick up" as="div">
        <div className="flex flex-wrap gap-2">
          {PICKUP_HOURS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => toggle(h)}
              aria-pressed={hours.includes(h)}
              className={cx("min-h-11 rounded-full px-[18px] text-[14.5px] font-semibold transition active:scale-95",
                hours.includes(h) ? "bg-ink text-white" : "bg-card text-ink shadow-soft")}
            >
              {h}
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}

const INPUT = "min-h-12 w-full rounded-[12px] border border-line bg-card px-4 py-3 text-[16px] font-semibold outline-none placeholder:font-normal placeholder:text-moss/70 focus:border-ink";

function Field({ label, hint, children, as = "label" }: { label: string; hint?: string; children: React.ReactNode; as?: "label" | "div" }) {
  const Tag = as;
  return (
    <Tag className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-moss">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[13px] text-moss">{hint}</span>}
    </Tag>
  );
}
