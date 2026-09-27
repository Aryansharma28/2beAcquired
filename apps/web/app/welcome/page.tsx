"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createAccount, getAccount, updateAccount, type Account, type Profile } from "@/lib/account";
import { ConnectMarktplaats, ProfileFields } from "@/components/Connect";
import { Icon, Wordmark } from "@/components/ui";

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
  const back = () => setStep(step === "connect" ? "profile" : "intro");

  return (
    <main className="welcome">
      <div className="top2">
        {step === "intro"
          ? <Wordmark className="welcome-mark" />
          : <button className="icon-btn" type="button" aria-label="Back" onClick={back}><Icon name="back" /></button>}
        <div className="wizbar" aria-hidden="true"><i style={{ width: `${Math.round(((idx + 1) / 3) * 100)}%` }}></i></div>
        <span className="step-count">{idx + 1} of 3</span>
      </div>

      <div key={step} className="body2" style={{ animation: "fadeUp .28s var(--out) backwards" }}>
        {step === "intro" && (
          <>
            <div className="welcome-hero">
              <span className="pricetag sold" style={{ ["--tilt" as string]: "-6deg", position: "static", fontSize: 26, padding: "8px 16px 8px 26px", animation: "tagDrop .4s var(--out) backwards" }}>Sold €35</span>
            </div>
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

        {step === "profile" && (
          <>
            <h1 className="q">Where do buyers pick up?</h1>
            <p className="sub">Poof shares this with the buyer once there is a deal.</p>
            <ProfileFields value={profile} onChange={setProfile} />
          </>
        )}

        {step === "connect" && (
          <>
            <h1 className="q">Connect Marktplaats</h1>
            <p className="sub">So Poof can put your ads online and answer buyers.</p>
            <ConnectMarktplaats onConnected={finish} onSkip={finish} />
          </>
        )}

        {error && <p className="xs" style={{ color: "var(--alert)", marginTop: 16 }}>{error}</p>}
      </div>

      {step !== "connect" && (
        <div className="foot2 welcome-foot">
          {step === "intro" && (
            <button className="btn" type="button" onClick={() => setStep("profile")}>Get started<svg className="icon cta-ic" aria-hidden="true"><use href="#i-cta-arrow" /></svg></button>
          )}
          {step === "profile" && (
            <button className="btn" type="button" onClick={saveProfile} disabled={busy || !profile.name?.trim() || !profile.pickupCity?.trim()}>
              {busy ? "Saving…" : "Next"}{!busy && <svg className="icon cta-ic" aria-hidden="true"><use href="#i-cta-arrow" /></svg>}
            </button>
          )}
        </div>
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
