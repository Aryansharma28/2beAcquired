"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createAccount, getAccount, updateAccount, type Account, type Profile } from "@/lib/account";
import { ConnectMarktplaats, ProfileFields } from "@/components/Connect";
import { Icon, Wordmark } from "@/components/ui";

type Step = "profile" | "connect";

/** First run, right after logging in (app/login): your pickup details → connect Marktplaats. */
export default function Welcome() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("profile");
  const [profile, setProfile] = useState<Profile>({ pickupCity: "Amsterdam", pickupHours: ["Weekend daytime"] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAccount()
      .then((a) => {
        if (!a) return router.replace("/login");
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

  const idx = ["profile", "connect"].indexOf(step);

  return (
    <main className="welcome">
      <div className="top2">
        {step === "profile"
          ? <Wordmark className="welcome-mark" />
          : <button className="icon-btn" type="button" aria-label="Back" onClick={() => setStep("profile")}><Icon name="back" /></button>}
        <div className="wizbar" aria-hidden="true"><i style={{ width: `${Math.round(((idx + 1) / 2) * 100)}%` }}></i></div>
        <span className="step-count">{idx + 1} of 2</span>
      </div>

      <div key={step} className="body2" style={{ animation: "fadeUp .28s var(--out) backwards" }}>
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
