"use client";

import { useEffect, useState } from "react";
import { disablePush, dismissPrompt, enablePush, promptDismissed, pushState, type PushState } from "@/lib/push";
import { Icon } from "./ui";

/** Current push state of this device, plus on/off actions (both meant to run from a tap). */
function usePush() {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    pushState().then((s) => { if (alive) setState(s); });
    return () => { alive = false; };
  }, []);
  const run = (fn: () => Promise<PushState>) => {
    setBusy(true);
    setError(null);
    fn()
      .then(setState)
      .catch((e: Error) => { setError(e.message || "Something went wrong. Try again."); pushState().then(setState); })
      .finally(() => setBusy(false));
  };
  return { state, busy, error, enable: () => run(enablePush), disable: () => run(disablePush) };
}

/** One short line, only when the switch can't simply be flipped. */
const HINT: Partial<Record<PushState, string>> = {
  denied: "Blocked. Allow Poof in your phone’s notification settings.",
  "needs-install": "Add Poof to your home screen first.",
  unsupported: "Not supported in this browser.",
};

/** Profile sheet: one compact "Phone notifications" row with a switch. */
export function PushCard() {
  const { state, busy, error, enable, disable } = usePush();
  const on = state === "on";
  const can = state === "on" || state === "off";
  const hint = error ?? HINT[state];
  return (
    <section>
      <p className="sec">Notifications</p>
      <label className="card pad row" style={{ boxShadow: "var(--shadow-soft)", cursor: can ? "pointer" : "default" }}>
        <Icon name="bell" />
        <span className="grow">
          <b style={{ display: "block", fontWeight: 700 }}>Phone notifications</b>
          {hint && <span className="xs" style={{ color: error ? "var(--alert)" : "var(--moss)" }}>{hint}</span>}
        </span>
        <input
          type="checkbox"
          role="switch"
          className="pswitch"
          aria-label="Phone notifications"
          checked={on}
          disabled={!can || busy}
          onChange={() => (on ? disable() : enable())}
        />
      </label>
    </section>
  );
}

/**
 * One-time nudge on the product page once an ad is live: "Get a ping when a buyer makes an offer".
 * Only while notifications are off, never again once turned on or dismissed. The permission prompt only
 * opens from the "Turn on" tap.
 */
export function PushPrompt() {
  const { state, busy, error, enable } = usePush();
  const [show, setShow] = useState<boolean | null>(null);
  if (show === null && state !== "loading") setShow(state === "off" && !promptDismissed());
  if (!show || state === "on") return null;

  const close = () => { dismissPrompt(); setShow(false); };
  return (
    <div className="card row" role="region" aria-label="Phone notifications"
      style={{ background: "var(--limetint)", marginTop: 12, padding: "10px 8px 10px 14px", gap: 10, animation: "fadeUp .28s var(--out) backwards" }}>
      <Icon name="bell" />
      <span className="grow small" style={{ fontWeight: 600, lineHeight: 1.3 }}>
        {state === "denied" ? HINT.denied : error ?? "Get a ping when a buyer makes an offer"}
      </span>
      {state === "off" && (
        <button type="button" onClick={() => { dismissPrompt(); enable(); }} disabled={busy}
          style={{ flex: "none", minHeight: 34, padding: "0 14px", borderRadius: 999, border: 0, background: "var(--ink)", color: "var(--lime)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          {busy ? "…" : "Turn on"}
        </button>
      )}
      <button type="button" className="icon-btn plain" aria-label="Dismiss" onClick={close} style={{ flex: "none", background: "transparent", boxShadow: "none", width: 34, height: 34 }}><Icon name="close" /></button>
    </div>
  );
}
