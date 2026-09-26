"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createAccount, getAccount, updateAccount, type Account, type Profile } from "@/lib/account";
import { ConnectMarktplaats, ProfileFields } from "@/components/Connect";
import { BottomAction, Button, CloudMark, Eyebrow, ICON_BTN, PriceTag, Wordmark, cx } from "@/components/ui";

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
          <button onClick={() => setStep(step === "connect" ? "profile" : "intro")} aria-label="Back" className={ICON_BTN}>
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
        )}
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => <span key={i} className={cx("h-1.5 rounded-full transition-all duration-300", i === idx ? "w-6 bg-ink" : "w-1.5 bg-line")} />)}
        </div>
      </header>

      <div key={step} className="animate-rise pt-4">
        {step === "intro" && (
          <>
            <div className="relative mb-8 mt-4 flex h-[180px] items-center justify-center overflow-hidden rounded-[28px] bg-limetint">
              <CloudMark className="absolute -left-8 top-6 h-24 w-auto text-lime" />
              <CloudMark className="absolute -right-6 bottom-3 h-16 w-auto text-lime" />
              <CloudMark className="absolute right-16 top-5 h-6 w-auto text-lime" />
              <PriceTag amount={35} size="lg" tilt={-8} label="sold" dark className="animate-pop" />
            </div>
            <h1 className="text-[34px] font-extrabold leading-[1.08] tracking-[-0.03em]">
              Poof sells your stuff on Marktplaats <span className="marker">for you</span>
            </h1>
            <ul className="mt-6 space-y-3">
              {[
                ["Snap it", "Poof works out what it is, writes the ad and sets the price."],
                ["It haggles", "It answers every buyer and never goes below your minimum."],
                ["Poof, sold", "It plans the pickup and takes the ad down once it's sold."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3.5 rounded-[20px] bg-card p-4 shadow-soft animate-rise" style={{ animationDelay: `${120 + i * 80}ms` }}>
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-lime text-[14px] font-extrabold">{i + 1}</span>
                  <div>
                    <p className="text-[17px] font-bold leading-tight">{t}</p>
                    <p className="mt-0.5 text-[14.5px] leading-snug text-moss">{d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {step === "profile" && (
          <>
            <Eyebrow>About you</Eyebrow>
            <h1 className="mb-5 mt-1 text-[26px] font-extrabold leading-tight tracking-[-0.02em]">Where do buyers pick up?</h1>
            <ProfileFields value={profile} onChange={setProfile} />
          </>
        )}

        {step === "connect" && (
          <>
            <Eyebrow>Last step</Eyebrow>
            <h1 className="mb-5 mt-1 text-[26px] font-extrabold leading-tight tracking-[-0.02em]">Connect Marktplaats</h1>
            <ConnectMarktplaats onConnected={finish} onSkip={finish} />
          </>
        )}

        {error && <p className="mt-4 rounded-[20px] bg-alert-soft p-4 text-[14px] text-alert">{error}</p>}
      </div>

      {step !== "connect" && (
        <BottomAction>
          {step === "intro" && <Button onClick={() => setStep("profile")} className="w-full">Get started</Button>}
          {step === "profile" && (
            <Button onClick={saveProfile} disabled={busy || !profile.name?.trim() || !profile.pickupCity?.trim()} className="w-full">
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
