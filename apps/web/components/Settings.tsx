"use client";

import { useState } from "react";
import { disconnectMarktplaats, updateAccount, type Account, type Profile } from "@/lib/account";
import { ConnectMarktplaats, ProfileFields } from "./Connect";
import { PlatformLogo, Sheet } from "./ui";

/** Profile sheet (navbar "Profile"): Marktplaats status + pickup details. */
export function SettingsSheet({ open, onClose, account, onChange }: {
  open: boolean; onClose: () => void; account: Account; onChange: (a: Account) => void;
}) {
  const [connecting, setConnecting] = useState(false);
  const [profile, setProfile] = useState<Profile>(() => pick(account));
  const [busy, setBusy] = useState<null | "save" | "disconnect">(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy("save");
    setError(null);
    try {
      onChange(await updateAccount(profile));
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    setError(null);
    try {
      await disconnectMarktplaats();
      onChange({ ...account, mpConnected: false, mpName: undefined, connectedAt: undefined });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet open={open} onClose={() => { setConnecting(false); onClose(); }} title="Profile">
      <section>
        <p className="sec" style={{ marginTop: 0 }}>Marktplaats</p>
        {connecting ? (
          <ConnectMarktplaats
            compact
            onConnected={(a) => { onChange(a); setConnecting(false); }}
            onSkip={() => setConnecting(false)}
            skipLabel="Cancel"
          />
        ) : (
          <div className="card pad row" style={{ boxShadow: "var(--shadow-soft)" }}>
            <PlatformLogo platform="marktplaats" muted={!account.mpConnected} className="!size-10" />
            <span className="grow">
              <b style={{ display: "block", fontWeight: 700 }}>{account.mpConnected ? `Connected as ${account.mpName ?? "you"}` : "Not connected"}</b>
              <span className="xs muted">{account.mpConnected ? "Poof can post and answer buyers." : "Connect to put ads online."}</span>
            </span>
            {account.mpConnected ? (
              <button type="button" onClick={disconnect} disabled={busy !== null} className="btn small" style={{ borderColor: "var(--alert)", color: "var(--alert)", background: "transparent" }}>
                {busy === "disconnect" ? "…" : "Disconnect"}
              </button>
            ) : (
              <button type="button" onClick={() => setConnecting(true)} className="btn small" style={{ background: "var(--ink)", color: "var(--lime)" }}>Connect</button>
            )}
          </div>
        )}
      </section>

      {!connecting && (
        <section>
          <p className="sec">Pickup details</p>
          <ProfileFields value={profile} onChange={setProfile} />
          {error && <p className="xs" style={{ color: "var(--alert)", marginTop: 12 }}>{error}</p>}
          <button type="button" className="btn" onClick={save} disabled={busy !== null} style={{ marginTop: 20 }}>
            {busy === "save" ? "Saving…" : saved ? "Saved" : "Save"}
          </button>
        </section>
      )}
    </Sheet>
  );
}

function pick(a: Account): Profile {
  return { name: a.name ?? "", pickupCity: a.pickupCity ?? "", pickupAddress: a.pickupAddress ?? "", pickupHours: a.pickupHours ?? [] };
}
