"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createAccount, getAccount, updateAccount, type Account, type Profile } from "@/lib/account";
import { ConnectMarktplaats, ProfileFields } from "@/components/Connect";
import { BottomAction, Button, Eyebrow, PriceTag, Wordmark, cx } from "@/components/ui";

type Step = "intro" | "profile" | "connect";

/** First run: what poof does → your pickup details → connect Marktplaats. */
export default function Welcome() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("intro");
  const [profile, setProfile] = useState<Profile>({ pickupCity: "Amsterdam", pickupHours: ["Weekend daytime"] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAccount()
      .then((a) => {
        if (!a) return;
        if (a.onboarded) return router.replace("/");
        setProfile((p) => ({ ...p, ...strip(a) }));
      })
      .catch(() => {});
  }, [router]);

  async function saveProfile() {
    setBusy(true);
    setError(null);
    try {
      const a = await createAccount(profile);
      if (a.mpConnected) return finish();
      setStep("connect");
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(`Couldn't save: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    try { await updateAccount({ onboarded: true }); } catch { /* still go home */ }
    router.replace("/");
  }

  const idx = ["intro", "profile", "connect"].indexOf(step);

  return (
    <main className="flex flex-1 flex-col px-5 pb-32 pt-[max(18px,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between py-2">
        {step === "intro" ? <Wordmark className="text-[22px]" /> : (
          <button onClick={() => setStep(step === "connect" ? "profile" : "intro")} aria-label="Back" className="grid size-10 place-items-center rounded-full bg-card ring-1 ring-line transition active:scale-95">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
        )}
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => <span key={i} className={cx("h-1.5 rounded-full transition-all duration-300", i === idx ? "w-6 bg-cobalt" : "w-1.5 bg-line")} />)}
        </div>
      </header>

      <div key={step} className="animate-rise pt-4">
        {step === "intro" && (
          <>
            <div className="relative mb-8 mt-4 flex h-[180px] items-center justify-center overflow-hidden rounded-[32px] bg-cobalt">
              <span className="absolute -left-6 top-6 size-24 rounded-full bg-white/10" />
              <span className="absolute -right-4 bottom-4 size-16 rounded-full bg-white/10" />
              <span className="absolute left-1/2 top-4 size-6 -translate-x-24 rounded-full bg-white/20" />
              <PriceTag amount={35} size="lg" tilt={-8} label="sold" className="animate-pop" />
            </div>
            <h1 className="font-display text-[40px] font-extrabold leading-[0.95] tracking-[-0.045em]">
              poof sells your stuff on Marktplaats for you
            </h1>
            <ul className="mt-6 space-y-3">
              {[
                ["Snap it", "Your agent works out what it is, writes the ad and sets the price."],
                ["It haggles", "It answers every buyer and never goes below your minimum."],
                ["poof, sold", "It plans the pickup and takes the ad down once it's sold."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3.5 rounded-[22px] bg-card p-4 ring-1 ring-line/60 animate-rise" style={{ animationDelay: `${120 + i * 80}ms` }}>
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-tag font-mono text-[13px] font-bold">{i + 1}</span>
                  <div>
                    <p className="font-display text-[18px] font-bold leading-tight tracking-[-0.02em]">{t}</p>
                    <p className="mt-0.5 text-[14.5px] leading-snug text-ink-2">{d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {step === "profile" && (
          <>
            <Eyebrow>About you</Eyebrow>
            <h1 className="mb-5 font-display text-[36px] font-extrabold leading-[0.95] tracking-[-0.045em]">Where do buyers pick up?</h1>
            <ProfileFields value={profile} onChange={setProfile} />
          </>
        )}

        {step === "connect" && (
          <>
            <Eyebrow>Last step</Eyebrow>
            <h1 className="mb-5 font-display text-[36px] font-extrabold leading-[0.95] tracking-[-0.045em]">Connect Marktplaats</h1>
            <ConnectMarktplaats onConnected={finish} onSkip={finish} />
          </>
        )}

        {error && <p className="mt-4 rounded-2xl bg-alert-soft p-4 text-[14px] text-alert">{error}</p>}
      </div>

      {step !== "connect" && (
        <BottomAction>
          {step === "intro" && <Button onClick={() => setStep("profile")} className="w-full !py-4 !text-[18px]">Get started</Button>}
          {step === "profile" && (
            <Button onClick={saveProfile} disabled={busy || !profile.name?.trim() || !profile.pickupCity?.trim()} className="w-full !py-4 !text-[18px]">
              {busy ? "Saving…" : "Next"}
            </Button>
          )}
        </BottomAction>
      )}
    </main>
  );
}

function strip(a: Account): Profile {
  const p: Profile = {};
  if (a.name) p.name = a.name;
  if (a.pickupCity) p.pickupCity = a.pickupCity;
  if (a.pickupAddress) p.pickupAddress = a.pickupAddress;
  if (a.pickupHours?.length) p.pickupHours = a.pickupHours;
  return p;
}
