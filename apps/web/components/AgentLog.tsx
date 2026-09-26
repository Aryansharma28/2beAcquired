"use client";

import { clock } from "@/lib/format";
import type { Item, ItemEvent } from "@/lib/types";
import { cx } from "./ui";

const KIND: Record<ItemEvent["type"], { label: string; dot: string }> = {
  step: { label: "Step", dot: "bg-cobalt" },
  decision: { label: "Decision", dot: "bg-tag ring-2 ring-ink" },
  notify: { label: "Push sent", dot: "bg-go" },
  error: { label: "Problem", dot: "bg-alert" },
};

/** Everything the agent did, newest first. */
export function AgentLog({ item }: { item: Item }) {
  const events = [...item.events].reverse();
  if (!events.length) {
    return <p className="rounded-3xl bg-card p-6 text-center text-ink-2 ring-1 ring-line/60">The agent hasn&apos;t done anything yet.</p>;
  }
  return (
    <ol className="relative rounded-[28px] bg-card px-4 py-3 ring-1 ring-line/60">
      <span className="absolute bottom-6 left-[27px] top-6 w-px bg-line" />
      {events.map((e, i) => (
        <li key={`${e.ts}-${i}`} className="relative flex animate-rise gap-3.5 py-2.5">
          <span className={cx("relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full", KIND[e.type].dot)} style={{ marginLeft: 7 }} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-mono text-[10.5px] font-bold uppercase tracking-[0.12em] text-mute">
              {KIND[e.type].label} <span className="font-medium normal-case tracking-normal">{clock(e.ts)}</span>
            </p>
            <p className={cx("mt-0.5 text-[15px] leading-snug", e.type === "decision" && "font-bold", e.type === "error" && "text-alert")}>{e.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
