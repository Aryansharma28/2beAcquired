"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { POLL_MS, getItem } from "@/lib/api";
import type { Item, Status } from "@/lib/types";
import { AdReady, ListingPreviews } from "@/components/AdReady";
import { AgentAtWork } from "@/components/AgentAtWork";
import { AgentLog } from "@/components/AgentLog";
import { ChatLive } from "@/components/ChatLive";
import { Sold } from "@/components/Sold";
import { BackButton, Button, ListingPill, Segmented, StatusPill } from "@/components/ui";

type Screen = "agent" | "ad" | "chat" | "sold" | "error";
type View = "now" | "ad" | "log";

function screenFor(s: Status): Screen {
  if (s === "analyzing") return "agent";
  if (s === "ad_ready" || s === "publishing") return "ad";
  if (s === "live" || s === "negotiating" || s === "needs_you") return "chat";
  if (s === "deal" || s === "pickup_scheduled" || s === "sold" || s === "delisted") return "sold";
  return "error";
}

const NOW_LABEL: Record<Screen, string> = { agent: "Agent", ad: "Launch", chat: "Chats", sold: "Sold", error: "Status" };

export default function ItemPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("now");
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

  // Jump back to the live screen whenever the item moves to a new stage.
  const screen = item ? screenFor(item.status) : null;
  const lastScreen = useRef(screen);
  useEffect(() => {
    if (screen && lastScreen.current && screen !== lastScreen.current) {
      setView("now");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    lastScreen.current = screen;
  }, [screen]);

  return (
    <main className="flex flex-1 flex-col px-5 pb-8 pt-[max(16px,env(safe-area-inset-top))]">
      <header className="flex items-center gap-3 py-2">
        <BackButton />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[19px] font-bold leading-tight tracking-[-0.03em]">
            {item?.title ?? (item ? "New item" : " ")}
          </p>
        </div>
        {item && <StatusPill status={item.status} />}
      </header>

      {error && !item && (
        <div className="mt-8 rounded-3xl bg-alert-soft p-5 text-alert">
          <p className="font-semibold">Can&apos;t load this item.</p>
          <p className="mt-1 text-[14px]">{error}</p>
          <Button href="/" variant="ghost" className="mt-4">Back to your items</Button>
        </div>
      )}

      {!item && !error && (
        <div className="mt-4 space-y-4">
          <div className="skeleton aspect-[4/3] rounded-[28px]" />
          <div className="skeleton h-40 rounded-[28px]" />
        </div>
      )}

      {item && screen && (
        <>
          <div className="sticky top-0 z-20 -mx-5 bg-paper/90 px-5 pb-3 pt-2 backdrop-blur">
            <Segmented<View>
              value={view}
              onChange={setView}
              options={[
                { value: "now", label: NOW_LABEL[screen] },
                { value: "ad", label: "Ad" },
                { value: "log", label: "Agent log" },
              ]}
            />
          </div>

          <div key={view === "now" ? screen : view} className="flex-1 animate-fade pt-2">
            {view === "log" && <AgentLog item={item} />}
            {view === "ad" && <AdTab item={item} />}
            {view === "now" && screen === "agent" && <AgentAtWork item={item} />}
            {view === "now" && screen === "ad" && <AdReady item={item} />}
            {view === "now" && screen === "chat" && <ChatLive item={item} />}
            {view === "now" && screen === "sold" && <Sold item={item} />}
            {view === "now" && screen === "error" && (
              <div className="rounded-3xl bg-alert-soft p-5 text-alert">
                <p className="font-display text-[20px] font-bold">The agent hit a problem</p>
                <p className="mt-1 text-[15px]">{item.events.filter((e) => e.type === "error").at(-1)?.text ?? "Check the agent log for details."}</p>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}

function AdTab({ item }: { item: Item }) {
  if (!item.description) {
    return (
      <div className="space-y-3">
        <p className="px-1 text-[15px] text-ink-2">The agent is still writing the ad.</p>
        <div className="skeleton aspect-[4/3] rounded-[22px]" />
        <div className="skeleton h-24 rounded-[22px]" />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {item.listings.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {item.listings.map((l) =>
            l.url && l.status === "live" ? (
              <a key={l.platform} href={l.url} target="_blank" rel="noreferrer"><ListingPill platform={l.platform} status={l.status} /></a>
            ) : (
              <ListingPill key={l.platform} platform={l.platform} status={l.status} />
            ),
          )}
        </div>
      )}
      <ListingPreviews item={item} />
    </div>
  );
}
