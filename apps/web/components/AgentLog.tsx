"use client";

import type { ReactNode } from "react";
import type { Item, ItemEvent } from "@/lib/types";
import { cx } from "./ui";

const KIND: Record<ItemEvent["type"], { label: string; icon: ReactNode; bubble: string }> = {
  step: {
    label: "Step",
    bubble: "bg-cobalt-soft text-cobalt-deep",
    icon: <path d="M5 12h14M13 6l6 6-6 6" />,
  },
  decision: {
    label: "Decision",
    bubble: "bg-tag text-ink",
    icon: <><path d="M4 12.5V5h7.5L20 13.5 13.5 20z" /><circle cx="8.5" cy="8.5" r="1.3" /></>,
  },
  notify: {
    label: "Milestone",
    bubble: "bg-go-soft text-go",
    icon: <><path d="M6 21V4" /><path d="M6 4h11l-2 4 2 4H6" /></>,
  },
  error: {
    label: "Problem",
    bubble: "bg-alert text-white",
    icon: <><path d="M12 7v6" /><path d="M12 17h.01" /></>,
  },
};

function stamp(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const today = new Date().toDateString() === d.toDateString();
  return today ? time : `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} ${time}`;
}

/** The agent's audit trail: everything it did, newest first. */
export function AgentLog({ item, limit }: { item: Item; limit?: number }) {
  const events = [...item.events].reverse().slice(0, limit);
  if (!events.length) {
    return <p className="rounded-3xl bg-card p-6 text-center text-ink-2 ring-1 ring-line/60">Nothing yet. Every step your agent takes shows up here.</p>;
  }
  return (
    <ol className="relative rounded-[26px] bg-card px-3 py-2 ring-1 ring-line/60">
      <span className="absolute bottom-7 left-[27px] top-7 w-px bg-line" aria-hidden />
      {events.map((e, i) => {
        const k = KIND[e.type] ?? KIND.step;
        return (
          <li key={`${e.ts}-${i}`} className="relative flex gap-3 py-2.5">
            <span className={cx("relative z-10 grid size-[30px] shrink-0 place-items-center rounded-full ring-4 ring-card", k.bubble)}>
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">{k.icon}</svg>
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className={cx("text-[14.5px] leading-snug", e.type === "decision" && "font-bold", e.type === "error" && "text-alert")}>{e.text}</p>
              <p className="mt-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.1em] text-mute">
                {k.label} · <span className="font-medium normal-case tracking-normal">{stamp(e.ts)}</span>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
