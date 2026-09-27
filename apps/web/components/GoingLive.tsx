"use client";

import { useEffect, useRef, useState } from "react";
import { coverFirst } from "@/lib/useItem";
import type { Item } from "@/lib/types";
import { PoofCloud } from "./PoofCloud";
import { Ic, MpIcon, SfScreen } from "./Wizard";
import { DEMO_PLATFORMS, SOON_PLATFORMS, SoonPlatIcon, SoonStrip, cx } from "./ui";

const SPRING = "linear(0,.009,.035 2.1%,.141,.281 6.7%,.723 12.9%,.938 16.7%,1.017,1.077,1.121,1.149 24.3%,1.159,1.163,1.161,1.154 29.9%,1.129 32.8%,1.051 39.6%,1.017 43.1%,.991,.977 51%,.974 53.8%,.975 57.1%,.997 69.8%,1.003 76.9%,1.004 83.8%,1)";

/** When each beat of the (optimistic) moment plays, in ms after mount. */
const T = { sticker: 60, settle: 610, poof: 1050, fly: 1260, live: 1920, collapse: 2450 };
const T_REDUCED = { sticker: 300, settle: 300, poof: 800, fly: 800, live: 1100, collapse: 1100 };

type Cloud = { x: number; y: number; size: number };

function sound(src: string, volume: number) {
  try {
    const a = new Audio(src);
    a.volume = volume;
    a.play().catch(() => {});
  } catch { /* no audio: fine */ }
}

/** What the backend says about the Marktplaats listing: really online (and where), or failed. */
export function realListing(item: Item) {
  const mp = item.listings.find((l) => l.platform === "marktplaats");
  const live = mp?.status === "live" || ["live", "negotiating", "needs_you"].includes(item.status);
  const failed = !live && (mp?.status === "error" || item.status === "error");
  return { live, failed, url: mp?.status === "live" ? mp.url : undefined };
}

/**
 * The go-live moment (prototype renderGoLive), played optimistically: within ~2 s of "Approve and sell"
 * the photo turns into a sticker, poofs into a cloud (the prototype's poof sprite), a small copy flies to
 * Marktplaats, the ring fills and the headline turns into "Live on Marktplaats", whatever the backend says.
 * Real posting (about 50 s: a real browser on the owner's laptop) carries on in the background. Until the
 * real listing URL exists, "View on Marktplaats" reads "Opening in a moment…" and is disabled; then it
 * becomes the real link. A failed post is never hidden: the moment stops at "Posting failed" (and the item
 * page swaps to the ErrorCard with Retry). `onLive` fires once the moment reaches its live end state.
 * Tapping after that calls `onDone` (skip), or hides the moment when no handler is given.
 */
export function GoingLive({ item, onDone, onLive, inline }: { item: Item; onDone?: () => void; onLive?: () => void; inline?: boolean }) {
  const { failed, url } = realListing(item);
  const photo = coverFirst(item)[0];
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const onLiveRef = useRef(onLive);
  useEffect(() => { onLiveRef.current = onLive; });
  const [stickered, setStickered] = useState(false);
  const [flown, setFlown] = useState(false);
  const [poofed, setPoofed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [cloud, setCloud] = useState<Cloud | null>(null);
  const [optimistic, setOptimistic] = useState(false);
  const [head, setHead] = useState<"putting" | "fade" | "live">("putting");
  const [hidden, setHidden] = useState(false);
  const [reduce] = useState(() => typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);

  // The whole moment runs on a clock, not on the listing status. It only stops if posting failed.
  useEffect(() => {
    if (failed) return;
    const t = reduce ? T_REDUCED : T;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => { timers.push(setTimeout(fn, ms)); };

    // 1. photo → sticker, then the hero settles with a small tilt.
    at(t.sticker, () => setStickered(true));
    at(t.settle, () => heroRef.current?.animate(
      [{ transform: "rotate(0deg) scale(1.04)" }, { transform: "rotate(-3deg) scale(1)" }],
      { duration: reduce ? 1 : 420, easing: SPRING, fill: "forwards" },
    ));

    // 2. poof: the sticker squashes and vanishes into a cloud (prototype poofSticker + spritePoofIn).
    at(t.poof, () => {
      const root = rootRef.current, hero = heroRef.current;
      if (reduce || !root || !hero) { setPoofed(true); return; }
      hero.animate([
        { transform: "rotate(-3deg) scale(1,1)", opacity: 1 },
        { transform: "rotate(-3deg) scale(1.14,.84)", opacity: 1, offset: 0.45 },
        { transform: "rotate(-3deg) scale(.86,1.18)", opacity: 1, offset: 0.75 },
        { transform: "rotate(-3deg) scale(0,0)", opacity: 0 },
      ], { duration: 300, easing: "ease-in", fill: "forwards" });
      at(190, () => {
        const c = root.getBoundingClientRect(), h = hero.getBoundingClientRect();
        // The hero is mid-squash here, so size the cloud from its layout box, not its transformed rect.
        const size = Math.min(280, Math.max(hero.offsetWidth, hero.offsetHeight) * 1.35);
        setCloud({ x: h.left + h.width / 2 - c.left, y: h.top + h.height / 2 - c.top, size });
        setPoofed(true);
        sound("/brand/poof-item.mp3", 0.5);
      });
    });

    // 3. out of the cloud, a small copy of the item flies to Marktplaats; the ring starts filling.
    at(t.fly, () => {
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
        { transform: "translate(0,-10px) scale(1)", opacity: 1, offset: 0.2 },
        { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 40}px) scale(.85) rotate(-8deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${dx}px,${dy}px) scale(.45) rotate(0deg)`, opacity: 0, offset: 1 },
      ], { duration: 620, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
      anim.addEventListener("finish", () => fly.remove());
    });

    // 4. live (optimistically): check, bump, headline morph.
    at(t.live, () => {
      setOptimistic(true);
      onLiveRef.current?.();
      wrapRef.current?.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.14)" }, { transform: "scale(1)" }],
        { duration: reduce ? 1 : 320, easing: "cubic-bezier(.3,1.4,.5,1)" },
      );
      setHead("fade");
      at(200, () => setHead("live"));
    });

    // 5. the empty spot where the item was folds away, so the live state sits centred.
    at(t.collapse, () => setCollapsed(true));
    return () => timers.forEach(clearTimeout);
  }, [failed, reduce, photo]);

  if (hidden) return null;

  const liveReady = optimistic && !failed;
  const skip = () => { if (!liveReady) return; if (onDone) onDone(); else setHidden(true); };
  const body = (
    <div ref={rootRef} className="golive" onClick={skip} role="presentation">
      <div ref={heroRef} className={cx("golive-hero", collapsed && "gone", reduce && poofed && "faded")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo && <img className="photo" src={photo} alt="" style={{ opacity: stickered ? 0 : 1, transition: "opacity .55s var(--out)" }} />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo && <img className="sticker-img" src={photo} alt="" style={{ opacity: stickered ? 1 : 0, transition: "opacity .55s var(--out)" }} />}
      </div>
      {cloud && <PoofCloud {...cloud} onGone={() => setCloud(null)} />}
      <h1 className="golive-head" aria-live="polite" style={{ transition: "opacity .2s var(--out)", opacity: head === "fade" ? 0 : 1 }}>
        {failed ? "Posting failed" : head === "live" ? <><span className="pb">Live</span> on {DEMO_PLATFORMS ? "4 platforms" : "Marktplaats"}</> : "Putting it online"}
      </h1>
      <div className="golive-plats">
        <div className="gplat" data-plat="marktplaats">
          <span className="wrap" ref={wrapRef}>
            <svg className="ring" width="56" height="56" viewBox="0 0 56 56" aria-hidden>
              <circle cx="28" cy="28" r="24" />
              <circle className={cx("fg", flown && !liveReady && !failed && "posting")} cx="28" cy="28" r="24" style={liveReady ? { strokeDashoffset: 0 } : undefined} />
            </svg>
            <MpIcon size={40} />
            <span className={cx("check", liveReady && "show")}><Ic n="check" /></span>
          </span>
          <span className={cx("lbl xs", liveReady && "live", failed && "err")}>Marktplaats</span>
          <span className={cx("st", (liveReady || failed) && "show", failed && "err")} aria-hidden>{failed ? "Failed" : "Live"}</span>
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
      <div className={cx("golive-view", liveReady && "show")} aria-hidden={!liveReady}>
        {url ? (
          <a className="btn secondary" href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} tabIndex={liveReady ? 0 : -1}>
            View on Marktplaats ↗
          </a>
        ) : (
          <>
            <button className="btn secondary" type="button" disabled onClick={(e) => e.stopPropagation()}>
              <span className="sf-spin" aria-hidden /> Opening in a moment…
            </button>
            <p className="golive-fine">Poof is finishing the upload on Marktplaats in the background.</p>
          </>
        )}
      </div>
      <p className="hint">{liveReady ? "Tap anywhere to continue" : "You can close the app. Poof keeps going."}</p>
    </div>
  );

  if (inline) return <div className="sf" style={{ display: "flex", minHeight: 420 }}>{body}</div>;
  return <SfScreen><div className="layer">{body}</div></SfScreen>;
}
