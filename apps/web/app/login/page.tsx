"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { MOCK } from "@/lib/api";
import { createAccount, getAccount } from "@/lib/account";
import { loginWithGoogle, sendEmailCode, verifyEmailCode, type Landing } from "@/lib/auth";
import { PoofCloud } from "@/components/PoofCloud";
import { Icon, Wordmark } from "@/components/ui";

type Step = "start" | "email" | "code" | "done";

const ERRORS: Record<string, string> = {
  cancelled: "Google login was cancelled. Try again, or use your email.",
  expired: "That took a while. Try again.",
  google: "Google login didn't work. Try again, or use your email.",
  account: "Couldn't load your account. Try again.",
  setup: "Login isn't set up yet. Use demo mode or try again later.",
};
const RESEND_S = 30;

/** Sign in: Google or a 6-digit email code. Once in, the sold tag goes poof and you're through. */
export default function Login() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("start");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<null | "google" | "send" | "verify">(null);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  // Back from Google (/login?done=… or ?error=…), or already signed in.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const done = q.get("done"), err = q.get("error");
    if (done === "home" || done === "welcome") {
      history.replaceState(null, "", "/login");
      (MOCK ? getAccount().then((a) => a ?? createAccount({})) : Promise.resolve()).then(() => poof(done));
      return;
    }
    if (err) {
      history.replaceState(null, "", "/login");
      Promise.resolve().then(() => setError(ERRORS[err] ?? ERRORS.google));
      return;
    }
    getAccount().then((a) => { if (a) router.replace(a.onboarded ? "/" : "/welcome"); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  function poof(to: Landing) {
    setStep("done");
    setError(null);
    setTimeout(() => router.replace(to === "home" ? "/" : "/welcome"), matchMedia("(prefers-reduced-motion: reduce)").matches ? 700 : 1650);
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    setBusy("send");
    setError(null);
    try {
      await sendEmailCode(email.trim());
      setCode("");
      setStep("code");
      setResendIn(RESEND_S);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function verify(value: string) {
    setBusy("verify");
    setError(null);
    try {
      poof(await verifyEmailCode(email.trim(), value));
    } catch (err) {
      setError((err as Error).message);
      setCode("");
    } finally {
      setBusy(null);
    }
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const back = () => { setError(null); setStep(step === "code" ? "email" : "start"); };

  return (
    <main className="welcome login">
      <div className="top2">
        {step === "email" || step === "code"
          ? <button className="icon-btn" type="button" aria-label="Back" onClick={back}><Icon name="back" /></button>
          : <Wordmark className="welcome-mark" />}
      </div>

      <div key={step === "done" ? "start" : step} className="body2" style={{ animation: step === "done" ? undefined : "fadeUp .28s var(--out) backwards" }}>
        {(step === "start" || step === "done") && (
          <>
            <Hero poofed={step === "done"} />
            {step === "done" ? (
              <div aria-live="polite" style={{ animation: "fadeUp .28s var(--out) .35s backwards" }}>
                <h1 className="q">You&apos;re in. <span className="pb">poof.</span></h1>
                <p className="sub">Let&apos;s sell some stuff.</p>
              </div>
            ) : (
              <>
                <h1 className="q">Poof sells your stuff on Marktplaats <span className="pb">for you</span></h1>
                <p className="sub">Snap it. poof. Sold.</p>
                <ol className="steps card divided" style={{ boxShadow: "var(--shadow-soft)" }}>
                  {[
                    ["Snap it", "Poof works out what it is, writes the ad and sets the price."],
                    ["It haggles", "It answers every buyer and never goes below your minimum."],
                    ["Poof, sold", "It plans the pickup and takes the ad down once it's sold."],
                  ].map(([t, d], i) => (
                    <li key={t} className="step" data-state="running" style={{ background: "none", animation: "fadeUp .28s var(--out) backwards", animationDelay: `${120 + i * 35}ms` }}>
                      <span className="st-ico" style={{ color: "var(--ink)", fontWeight: 800, fontSize: 13 }}>{i + 1}</span>
                      <div className="grow"><b>{t}</b><span className="small muted">{d}</span></div>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </>
        )}

        {step === "email" && (
          <form id="email-form" onSubmit={send}>
            <h1 className="q">What&apos;s your email?</h1>
            <p className="sub">We&apos;ll send you a 6-digit code. No password needed.</p>
            <input
              className="login-input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
              placeholder="you@example.com" aria-label="Email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </form>
        )}

        {step === "code" && (
          <>
            <h1 className="q">Check your email</h1>
            <p className="sub">Type the 6-digit code we sent to <b className="login-email">{email.trim()}</b></p>
            <CodeInput value={code} busy={busy === "verify"} bad={!!error} onChange={(v) => { setCode(v); if (error) setError(null); if (v.length === 6) verify(v); }} />
            <div className="login-resend xs">
              {resendIn > 0
                ? <span className="muted">Send a new code in 0:{String(resendIn).padStart(2, "0")}</span>
                : <button type="button" onClick={() => send()} disabled={busy !== null}>{busy === "send" ? "Sending…" : "Send a new code"}</button>}
              <button type="button" onClick={back}>Use another email</button>
            </div>
            {MOCK && <p className="xs muted" style={{ marginTop: 14 }}>Demo mode: any 6 digits work (000000 shows the error).</p>}
          </>
        )}

        {error && <p className="xs login-error" role="alert">{error}</p>}
      </div>

      {step !== "done" && step !== "code" && (
        <div className="foot2 welcome-foot">
          {step === "start" && (
            <>
              <button className="btn login-google" type="button" disabled={busy !== null} onClick={() => { setBusy("google"); loginWithGoogle(); }}>
                <GoogleG />{busy === "google" ? "Opening Google…" : "Continue with Google"}
              </button>
              <button className="btn" type="button" disabled={busy !== null} onClick={() => { setError(null); setStep("email"); }}>
                <svg className="icon" aria-hidden="true"><use href="#i-mail" /></svg>Continue with email
              </button>
            </>
          )}
          {step === "email" && (
            <button className="btn" type="submit" form="email-form" disabled={!emailOk || busy !== null}>
              {busy === "send" ? "Sending…" : "Send code"}{busy !== "send" && <svg className="icon cta-ic" aria-hidden="true"><use href="#i-cta-arrow" /></svg>}
            </button>
          )}
        </div>
      )}
    </main>
  );
}

/** The welcome hero's sold tag. On login it squashes into the poof cloud (same beat as going live). */
function Hero({ poofed }: { poofed: boolean }) {
  const heroRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLSpanElement>(null);
  const [cloud, setCloud] = useState<{ x: number; y: number; size: number } | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!poofed) return;
    const hero = heroRef.current, tag = tagRef.current;
    if (!hero || !tag || matchMedia("(prefers-reduced-motion: reduce)").matches) { setGone(true); return; }
    tag.animate([
      { transform: "rotate(-6deg) scale(1,1)", opacity: 1 },
      { transform: "rotate(-6deg) scale(1.14,.84)", opacity: 1, offset: 0.45 },
      { transform: "rotate(-6deg) scale(.86,1.18)", opacity: 1, offset: 0.75 },
      { transform: "rotate(-6deg) scale(0,0)", opacity: 0 },
    ], { duration: 300, easing: "ease-in", fill: "forwards" });
    const t = setTimeout(() => {
      const c = hero.getBoundingClientRect(), r = tag.getBoundingClientRect();
      setCloud({ x: r.left + r.width / 2 - c.left, y: r.top + r.height / 2 - c.top, size: Math.min(240, tag.offsetWidth * 1.9) });
      setGone(true);
      const a = new Audio("/brand/poof-item.mp3");
      a.volume = 0.5;
      a.play().catch(() => {});
    }, 190);
    return () => clearTimeout(t);
  }, [poofed]);

  return (
    <div ref={heroRef} className="welcome-hero login-hero">
      <span
        ref={tagRef} className="pricetag sold"
        style={{ ["--tilt" as string]: "-6deg", position: "static", fontSize: 26, padding: "8px 16px 8px 26px", animation: "tagDrop .4s var(--out) backwards", visibility: gone && !cloud ? "hidden" : undefined }}
      >Sold €35</span>
      {cloud && <PoofCloud {...cloud} />}
      {gone && <span className="login-in" aria-hidden><svg className="icon"><use href="#i-check" /></svg></span>}
    </div>
  );
}

/** Six boxes over one real input, so paste, SMS/email autofill and the number keyboard all just work. */
function CodeInput({ value, onChange, busy, bad }: { value: string; onChange: (v: string) => void; busy: boolean; bad: boolean }) {
  const [focus, setFocus] = useState(true);
  return (
    <label className={`login-code${bad ? " bad" : ""}${busy ? " busy" : ""}`}>
      <input
        autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} aria-label="6-digit code"
        value={value} disabled={busy} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      />
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className={focus && !busy && i === Math.min(value.length, 5) ? "on" : undefined} aria-hidden>{value[i] ?? ""}</span>
      ))}
    </label>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
