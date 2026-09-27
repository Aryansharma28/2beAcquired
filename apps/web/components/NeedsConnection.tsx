"use client";

import { useEffect, useState } from "react";
import { approve } from "@/lib/api";
import { getAccount } from "@/lib/account";
import { eur } from "@/lib/format";
import { coverFirst } from "@/lib/useItem";
import type { Item } from "@/lib/types";
import { ConnectMarktplaats } from "./Connect";
import { Button, Eyebrow, PlatformLogo, PriceTag } from "./ui";

/** status === "needs_connection": connect Marktplaats, then approve again. */
export function NeedsConnection({ item, onApproved }: { item: Item; onApproved: (patch: Partial<Item>) => void }) {
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photo = coverFirst(item)[0];

  useEffect(() => {
    getAccount().then((a) => setConnected(!!a?.mpConnected)).catch(() => {});
  }, []);

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      await approve({ itemId: item.id });
      onApproved({ status: "publishing", listings: [] });
    } catch (e) {
      setError(`Couldn't put it online: ${(e as Error).message}`);
      setBusy(false);
    }
  }

  if (connecting) {
    return (
      <div>
        <Eyebrow>One more step</Eyebrow>
        <h2 className="mb-5 mt-1 text-[26px] font-extrabold leading-tight tracking-[-0.02em]">Connect Marktplaats</h2>
        <ConnectMarktplaats onConnected={() => { setConnecting(false); setConnected(true); publish(); }} onSkip={() => setConnecting(false)} skipLabel="Not now" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[20px] bg-card shadow-soft">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo && <img src={photo} alt="" className="aspect-[16/10] w-full object-cover" />}
        <div className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-[18px] font-extrabold leading-tight">{item.title ?? item.recognition?.name}</p>
            {item.floorPrice != null && <p className="mt-1 text-[13.5px] text-moss">Never below {eur(item.floorPrice)}</p>}
          </div>
          {item.askPrice != null && <PriceTag amount={item.askPrice} size="sm" />}
        </div>
      </div>

      <div className="rounded-[20px] bg-lime p-5">
        <PlatformLogo platform="marktplaats" className="!size-9" />
        <p className="mt-3 text-[24px] font-extrabold leading-tight tracking-[-0.02em]">
          {connected ? "Marktplaats is connected" : "Connect Marktplaats to put this online"}
        </p>
        <p className="mt-2 text-[14.5px] leading-snug text-ink/75">
          Your ad is approved and ready. {connected ? "Tap below and Poof posts it." : "Link your account once, on this phone or with the poof Connector on your laptop; Poof posts it right after."}
        </p>
        {error && <p className="mt-3 rounded-[16px] bg-alert-soft p-3 text-[14px] text-alert">{error}</p>}
        <Button onClick={connected ? publish : () => setConnecting(true)} disabled={busy} variant="ink" className="mt-4 w-full">
          {busy ? "Putting it online…" : connected ? "Put it online" : "Connect Marktplaats"}
        </Button>
      </div>
    </div>
  );
}
