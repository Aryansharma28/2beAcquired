"use client";

import { useEffect, useRef, useState } from "react";
import { coverFirst } from "@/lib/useItem";
import type { Item } from "@/lib/types";
import { Ic, MpIcon, SfScreen } from "./Wizard";
import { DEMO_PLATFORMS, SOON_PLATFORMS, SoonPlatIcon, SoonStrip, cx } from "./ui";

const SPRING = "linear(0,.009,.035 2.1%,.141,.281 6.7%,.723 12.9%,.938 16.7%,1.017,1.077,1.121,1.149 24.3%,1.159,1.163,1.161,1.154 29.9%,1.129 32.8%,1.051 39.6%,1.017 43.1%,.991,.977 51%,.974 53.8%,.975 57.1%,.997 69.8%,1.003 76.9%,1.004 83.8%,1)";

type State = "queued" | "posting" | "live" | "error";

/**
 * The go-live moment (prototype renderGoLive): the photo turns into a sticker, flies to Marktplaats,
 * the ring fills and the headline turns into "Live on Marktplaats". Driven by the real listing status.
 * Full-screen by default; `inline` renders it inside the page instead. Tapping calls `onDone` (skip),
 * or hides the moment when no handler is given.
 */
export function GoingLive({ item, onDone, inline }: { item: Item; onDone?: () => void; inline?: boolean }) {
  const mp = item.listings.find((l) => l.platform === "marktplaats");
  const state: State =
    mp?.status === "live" || ["live", "negotiating", "needs_you"].includes(item.status) ? "live"
      : mp?.status === "error" || item.status === "error" ? "error" : mp ? "posting" : "queued";
  const photo = coverFirst(item)[0];
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [stickered, setStickered] = useState(false);
  const [flown, setFlown] = useState(false);
  const [head, setHead] = useState<"putting" | "fade" | "live">("putting");
  const [hidden, setHidden] = useState(false);
  const reduce = typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 1. photo → sticker, then the hero settles with a small tilt.
  useEffect(() => {
    const t1 = setTimeout(() => setStickered(true), reduce ? 300 : 60);
    const t2 = setTimeout(() => {
      heroRef.current?.animate(
        [{ transform: "rotate(0deg) scale(1.04)" }, { transform: "rotate(-3deg) scale(1)" }],
        { duration: reduce ? 1 : 420, easing: SPRING, fill: "forwards" },
      );
    }, reduce ? 300 : 610);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [reduce]);

  // 2. once Poof is posting (or already live), the sticker flies to Marktplaats.
  useEffect(() => {
    if (flown || state === "queued" || state === "error") return;
    const t = setTimeout(() => {
      setFlown(true);
      const root = rootRef.current, hero = heroRef.current, wrap = wrapRef.current;
      if (reduce || !root || !hero || !wrap || !photo) return;
      const c = root.getBoundingClientRect(), h = hero.getBoundingClientRect(), w = wrap.getBoundingClientRect();
      const sx = h.left + h.width / 2 - c.left, sy = h.top + h.height / 2 - c.top;
      const dx = w.left + w.width / 2 - c.left - sx, dy = w.top + w.height / 2 - c.top - sy;
      const fly = document.createElement("span");
      fly.className = "gfly";
      fly.innerHTML = `<img src="${photo.replace(/"/g, "&quot;")}" alt="" style="object-fit:cover;border-radius:10px">`;
      fly.style.left = `${sx - 42}px`;
      fly.style.top = `${sy - 42}px`;
      root.appendChild(fly);
      const anim = fly.animate([
        { transform: "translate(0,0) scale(.3)", opacity: 0 },
        { transform: "translate(0,-10px) scale(1.1)", opacity: 1, offset: 0.18 },
        { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 48}px) scale(.9) rotate(-8deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${dx}px,${dy}px) scale(.45) rotate(0deg)`, opacity: 0, offset: 1 },
      ], { duration: 620, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
      anim.addEventListener("finish", () => fly.remove());
    }, 1000);
    return () => clearTimeout(t);
  }, [state, flown, photo, reduce]);

  // 3. live: check, bump, headline morph, celebratory pop.
  const liveReady = state === "live" && flown;
  useEffect(() => {
    if (!liveReady) return;
    wrapRef.current?.animate([{ transform: "scale(1)" }, { transform: "scale(1.14)" }, { transform: "scale(1)" }], { duration: 320, easing: "cubic-bezier(.3,1.4,.5,1)" });
    const t0 = setTimeout(() => setHead("fade"), 0);
    const t1 = setTimeout(() => setHead("live"), 200);
    const t2 = setTimeout(() => {
      heroRef.current?.animate(
        [{ transform: "rotate(-3deg) scale(1)" }, { transform: "rotate(-3deg) scale(1.07)" }, { transform: "rotate(-3deg) scale(1)" }],
        { duration: 360, easing: SPRING },
      );
    }, 700);
    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); };
  }, [liveReady]);

  if (hidden) return null;

  const skip = () => { if (onDone) onDone(); else if (liveReady) setHidden(true); };
  const body = (
    <div ref={rootRef} className="golive" onClick={skip} role="presentation">
      <div ref={heroRef} className="golive-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo && <img className="photo" src={photo} alt="" style={{ opacity: stickered ? 0 : 1, transition: "opacity .55s var(--out)" }} />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo && <img className="sticker-img" src={photo} alt="" style={{ opacity: stickered ? 1 : 0, transition: "opacity .55s var(--out)" }} />}
      </div>
      <h1 className="golive-head" aria-live="polite" style={{ transition: "opacity .2s var(--out)", opacity: head === "fade" ? 0 : 1 }}>
        {state === "error" ? "Posting failed" : head === "live" ? <><span className="pb">Live</span> on {DEMO_PLATFORMS ? "4 platforms" : "Marktplaats"}</> : "Putting it online"}
      </h1>
      <div className="golive-plats">
        <div className="gplat" data-plat="marktplaats">
          <span className="wrap" ref={wrapRef}>
            <svg className="ring" width="56" height="56" viewBox="0 0 56 56" aria-hidden>
              <circle cx="28" cy="28" r="24" />
              <circle className={cx("fg", flown && state === "posting" && "posting")} cx="28" cy="28" r="24" style={liveReady ? { strokeDashoffset: 0 } : undefined} />
            </svg>
            <MpIcon size={40} />
            <span className={cx("check", liveReady && "show")}><Ic n="check" /></span>
          </span>
          <span className={cx("lbl xs", liveReady && "live", state === "error" && "err")}>Marktplaats</span>
          <span className={cx("st", (liveReady || state === "error") && "show", state === "error" && "err")} aria-hidden>{state === "error" ? "Failed" : "Live"}</span>
        </div>
        {DEMO_PLATFORMS && SOON_PLATFORMS.map((p, i) => {
          const delay = { transitionDelay: `${(i + 1) * 0.3}s` };
          return (
            <div key={p.key} className="gplat" data-plat={p.key}>
              <span className="wrap">
                <svg className="ring" width="56" height="56" viewBox="0 0 56 56" aria-hidden>
                  <circle cx="28" cy="28" r="24" />
                  <circle className="fg" cx="28" cy="28" r="24" style={liveReady ? { strokeDashoffset: 0, ...delay } : undefined} />
                </svg>
                <SoonPlatIcon platform={p.key} size={40} />
                <span className={cx("check", liveReady && "show")} style={delay}><Ic n="check" /></span>
              </span>
              <span className={cx("lbl xs", liveReady && "live")}>{p.name}</span>
              <span className={cx("st", liveReady && "show")} style={delay} aria-hidden>Live</span>
            </div>
          );
        })}
      </div>
      <SoonStrip style={{ marginTop: 14, justifyContent: "center" }} />
      <p className="hint">{liveReady || onDone ? "Tap to skip" : "You can close the app. Poof keeps going."}</p>
    </div>
  );

  if (inline) return <div className="sf" style={{ display: "flex", minHeight: 420 }}>{body}</div>;
  return <SfScreen><div className="layer">{body}</div></SfScreen>;
}
