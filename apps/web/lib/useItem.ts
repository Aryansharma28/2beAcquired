"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { POLL_FAST_MS, POLL_MS, getItem } from "./api";
import type { Item } from "./types";

/** Polls /tba/item while the page is open. */
export function useItem(id: string) {
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const it = await getItem(id);
      if (alive.current) { setItem(it); setError(null); }
      return it;
    } catch (e) {
      if (alive.current) setError((e as Error).message);
      return null;
    }
  }, [id]);

  useEffect(() => {
    alive.current = true;
    let t: ReturnType<typeof setTimeout>;
    const loop = async () => {
      const it = await refresh();
      const busy = it?.status === "recognizing" || (it?.status === "needs_details" && it.pricing);
      if (alive.current) t = setTimeout(loop, busy ? POLL_FAST_MS : POLL_MS);
    };
    loop();
    return () => { alive.current = false; clearTimeout(t); };
  }, [refresh]);

  return { item, error, refresh };
}

/** Photos with the chosen cover first. */
export function coverFirst(item: Pick<Item, "photos" | "coverIndex">) {
  const i = item.coverIndex ?? 0;
  const p = item.photos;
  if (!p[i] || i === 0) return p;
  return [p[i], ...p.filter((_, j) => j !== i)];
}
