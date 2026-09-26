"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CONSENT, PICKUP_HOURS, getAccount, newPairCode, phoneLoginStatus, startPhoneLogin, stopPhoneLogin, type Account, type PairCode, type PhoneLogin, type Profile } from "@/lib/account";
import { Button, Eyebrow, PlatformLogo, Tick, cx } from "./ui";

/** Connect Marktplaats: log in right here (secure browser streamed into the app), or the poof Connector on a laptop. */
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
        <div className="flex flex-col items-center rounded-[28px] bg-go px-6 py-8 text-center text-white">
          <span className="grid size-16 animate-pop place-items-center rounded-full bg-white text-go"><Tick className="size-9" /></span>
          <p className="mt-4 font-display text-[30px] font-extrabold leading-none tracking-[-0.04em]">Connected as {connected.mpName ?? "you"}</p>
          <p className="mt-2 text-[15px] text-white/85">Your agent can now post, answer and take ads down on Marktplaats.</p>
        </div>
        <Button onClick={() => onConnected(connected)} className="w-full !py-4 !text-[18px]">Continue</Button>
      </div>
    );
  }

  const left = code ? Math.max(0, Math.round((new Date(code.expiresAt).getTime() - now) / 1000)) : 0;
  const digits = (code?.code ?? "").split("");

  return (
    <div className="space-y-4">
      <PhoneLoginCard />

      <Eyebrow className="px-1 pt-2">Or on a laptop, with the poof Connector</Eyebrow>
      <div className="rounded-[28px] bg-ink px-5 pb-5 pt-4 text-white">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-tag">
            <PlatformLogo platform="marktplaats" className="!size-4 !text-[9px]" /> Your code
          </p>
          {code && <p className="font-mono text-[11.5px] font-bold text-white/50">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</p>}
        </div>
        <div className="mt-3 flex justify-between gap-1.5" aria-label={code ? `Code ${code.code}` : "Getting a code"}>
          {(digits.length ? digits : Array(6).fill("")).map((d, i) => (
            <span
              key={`${code?.code}-${i}`}
              className={cx("grid h-[62px] flex-1 place-items-center rounded-2xl bg-white/10 font-mono text-[34px] font-bold", i === 3 && "ml-2", d ? "animate-pop" : "skeleton !bg-white/10 opacity-40")}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {d}
            </span>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-2 text-[13.5px] text-white/70">
          <span className="relative grid size-3 place-items-center">
            <span className="absolute size-3 animate-ping rounded-full bg-tag/50" />
            <span className="size-1.5 rounded-full bg-tag" />
          </span>
          Waiting for the poof Connector…
        </p>
      </div>

      {error && <p className="rounded-2xl bg-alert-soft p-3 text-[14px] text-alert">Couldn&apos;t get a code: {error}</p>}

      <section>
        <ol className="overflow-hidden rounded-[24px] bg-card ring-1 ring-line/60">
          {[
            <>Install <Link href="/connector" className="font-bold text-cobalt underline decoration-cobalt/30 underline-offset-2">poof Connector</Link> in Chrome</>,
            <>Log in to <b>marktplaats.nl</b> as usual</>,
            <>Open poof Connector, enter this code and tap <b>Allow</b></>,
          ].map((t, i) => (
            <li key={i} className="flex items-center gap-3 border-b border-line/70 px-4 py-3.5 last:border-0">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-cobalt font-mono text-[13px] font-bold text-white">{i + 1}</span>
              <span className="text-[15px] leading-snug">{t}</span>
            </li>
          ))}
        </ol>
      </section>

      {!compact && <Consent />}

      {onSkip && (
        <button onClick={onSkip} className="w-full py-2 text-center text-[15px] font-semibold text-mute underline decoration-line underline-offset-4">
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
    <section className="rounded-[28px] bg-card p-5 ring-1 ring-line/60">
      <p className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-mute">
        <PlatformLogo platform="marktplaats" className="!size-4 !text-[9px]" /> On this phone
      </p>
      <p className="mt-2 text-[15px] leading-snug text-ink-2">
        Log in to Marktplaats in a secure window. You type your password and SMS code yourself; poof never sees them.
      </p>
      <Button onClick={start} disabled={busy} className="mt-4 w-full !py-4 !text-[17px]">
        {busy ? "Opening a secure browser… (~30 s)" : "Log in to Marktplaats"}
      </Button>
      {error && <p className="mt-3 rounded-2xl bg-alert-soft p-3 text-[14px] text-alert">{error}</p>}
      {url && createPortal(
        <div className="fixed inset-0 z-[100] flex flex-col bg-paper">
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-[13px] font-semibold text-mute">Secure Marktplaats login</span>
            <button onClick={() => { if (login) stopPhoneLogin(login); setUrl(null); setLogin(null); }} className="rounded-full px-3 py-1.5 text-[14px] font-bold text-ink ring-1 ring-line">Close</button>
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
    <section className={cx("rounded-[22px] bg-tag/30 px-4 py-3.5", className)}>
      <Eyebrow className="!text-ink/60">What you&apos;re allowing</Eyebrow>
      <ul className="mt-2 space-y-1.5">
        {CONSENT.map((c) => (
          <li key={c} className="flex gap-2 text-[13.5px] leading-snug text-ink-2">
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
              className={cx("rounded-full px-4 py-2 text-[14.5px] font-semibold transition active:scale-95",
                hours.includes(h) ? "bg-ink text-white" : "bg-card text-ink ring-1 ring-line")}
            >
              {h}
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}

const INPUT = "w-full rounded-2xl bg-card px-4 py-3.5 text-[17px] font-semibold outline-none ring-1 ring-line placeholder:font-normal placeholder:text-mute focus:ring-2 focus:ring-cobalt";

function Field({ label, hint, children, as = "label" }: { label: string; hint?: string; children: React.ReactNode; as?: "label" | "div" }) {
  const Tag = as;
  return (
    <Tag className="block">
      <span className="mb-1.5 block px-1 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-mute">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block px-1 text-[13px] text-mute">{hint}</span>}
    </Tag>
  );
}
