"use client";

import { useState } from "react";
import { disconnectMarktplaats, updateAccount, type Account, type Profile } from "@/lib/account";
import { ConnectMarktplaats, ProfileFields } from "./Connect";
import { Button, Eyebrow, PlatformLogo, Sheet } from "./ui";

/** Settings sheet: Marktplaats status + pickup details. */
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
    <Sheet open={open} onClose={() => { setConnecting(false); onClose(); }} title="Settings">
      <section>
        <Eyebrow className="mb-2">Marktplaats</Eyebrow>
        {connecting ? (
          <ConnectMarktplaats
            compact
            onConnected={(a) => { onChange(a); setConnecting(false); }}
            onSkip={() => setConnecting(false)}
            skipLabel="Cancel"
          />
        ) : (
          <div className="flex items-center gap-3 rounded-[20px] bg-card p-4 shadow-soft">
            <PlatformLogo platform="marktplaats" muted={!account.mpConnected} className="!size-9" />
            <div className="min-w-0 flex-1">
              <p className="text-[15.5px] font-bold">{account.mpConnected ? `Connected as ${account.mpName ?? "you"}` : "Not connected"}</p>
              <p className="text-[13px] text-moss">{account.mpConnected ? "Poof can post and answer buyers." : "Connect to put ads online."}</p>
            </div>
            {account.mpConnected ? (
              <button onClick={disconnect} disabled={busy !== null} className="h-[34px] rounded-full border border-alert px-3.5 text-[13px] font-bold text-alert disabled:opacity-50">
                {busy === "disconnect" ? "…" : "Disconnect"}
              </button>
            ) : (
              <button onClick={() => setConnecting(true)} className="h-[34px] rounded-full bg-ink px-3.5 text-[13px] font-bold text-lime">Connect</button>
            )}
          </div>
        )}
      </section>

      {!connecting && (
        <section className="mt-6">
          <div className="puff-line mb-4" />
          <Eyebrow className="mb-2">Pickup details</Eyebrow>
          <ProfileFields value={profile} onChange={setProfile} />
          {error && <p className="mt-3 rounded-[20px] bg-alert-soft p-3 text-[14px] text-alert">{error}</p>}
          <Button onClick={save} disabled={busy !== null} variant={saved ? "go" : "primary"} className="mt-5 w-full">
            {busy === "save" ? "Saving…" : saved ? "Saved" : "Save"}
          </Button>
        </section>
      )}
    </Sheet>
  );
}

function pick(a: Account): Profile {
  return { name: a.name ?? "", pickupCity: a.pickupCity ?? "", pickupAddress: a.pickupAddress ?? "", pickupHours: a.pickupHours ?? [] };
}
