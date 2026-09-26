"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { POLL_MS, getItem } from "./api";
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
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    alive.current = true;
    let t: ReturnType<typeof setTimeout>;
    const loop = async () => {
      await refresh();
      if (alive.current) t = setTimeout(loop, POLL_MS);
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
