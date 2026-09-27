"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { approve } from "@/lib/api";
import { getAccount } from "@/lib/account";
import { coverFirst } from "@/lib/useItem";
import type { Item } from "@/lib/types";
import { ConnectMarktplaats } from "./Connect";
import { CtaArrow, Ic, MpIcon, SfScreen, Sticker } from "./Wizard";

/** status === "needs_connection": connect Marktplaats, then approve again. Same sheet look as the sell flow. */
export function NeedsConnection({ item, onApproved }: { item: Item; onApproved: (patch: Partial<Item>) => void }) {
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photo = coverFirst(item)[0];
  const name = item.title ?? item.recognition?.name ?? "Your item";

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

  return (
    <SfScreen>
      <div className="layer">
        <div className="top2">
          {connecting ? (
            <button className="icon-btn" type="button" aria-label="Back" onClick={() => setConnecting(false)}><Ic n="back" /></button>
          ) : (
            <Link href="/" className="icon-btn" aria-label="Back"><Ic n="back" /></Link>
          )}
          <div className="grow" style={{ flex: 1, minWidth: 0 }}>
            <p className="eyebrow">One more step</p>
            <h1 className="bar-title" style={{ fontSize: 19 }}>Connect Marktplaats</h1>
          </div>
        </div>
        <div className="body2">
          <div className="context">
            <Sticker src={photo} tilt={-3} />
            <div className="info"><b>{name}</b>{item.askPrice != null && <span>· €{item.askPrice}{item.floorPrice != null ? `, never below €${item.floorPrice}` : ""}</span>}</div>
          </div>
          {connecting ? (
            <ConnectMarktplaats onConnected={() => { setConnecting(false); setConnected(true); publish(); }} onSkip={() => setConnecting(false)} skipLabel="Not now" />
          ) : (
            <>
              <div className="row" style={{ marginBottom: 14 }}><MpIcon size={40} /></div>
              <h2 className="q">{connected ? "Marktplaats is connected" : "Connect Marktplaats to put this online"}</h2>
              <p className="sub">
                Your ad is approved and ready. {connected ? "Tap below and Poof posts it." : "Link your account once, on this phone or with the poof Connector on your laptop; Poof posts it right after."}
              </p>
              {error && <p className="sf-error">{error}</p>}
            </>
          )}
        </div>
        {!connecting && (
          <div className="foot2">
            <button className="btn" type="button" onClick={connected ? publish : () => setConnecting(true)} disabled={busy}>
              {busy ? <><span className="sf-spin" /> Putting it online…</> : connected ? <>Put it online<CtaArrow /></> : <>Connect Marktplaats<CtaArrow /></>}
            </button>
          </div>
        )}
      </div>
    </SfScreen>
  );
}
