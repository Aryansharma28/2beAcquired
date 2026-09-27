"use client";

import { useState } from "react";
import { cx } from "./ui";

/**
 * A puff of cloud (prototype `spritePoofIn`: the 26-frame poof sprite, `/brand/poof-sprite.webp`).
 * Absolutely positioned inside the nearest positioned parent, centred on (x, y). Plays once, lingers
 * for a beat, drifts up and fades, then calls `onGone`. Callers skip it under prefers-reduced-motion.
 */
export function PoofCloud({ x, y, size, onGone }: { x: number; y: number; size: number; onGone?: () => void }) {
  const [out, setOut] = useState(false);
  return (
    <span
      className={cx("poof-fx golive-poof", out && "out")}
      aria-hidden
      style={{ width: size, height: size, left: x - size / 2, top: y - size / 2 }}
      onAnimationEnd={() => {
        setTimeout(() => setOut(true), 200);
        setTimeout(() => onGone?.(), 600);
      }}
    />
  );
}
