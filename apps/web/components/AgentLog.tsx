"use client";

import type { ReactNode } from "react";
import type { Item, ItemEvent } from "@/lib/types";
import { cx } from "./ui";

const KIND: Record<ItemEvent["type"], { label: string; icon: ReactNode; bubble: string }> = {
  step: {
    label: "Step",
    bubble: "bg-limetint text-ink",
    icon: <path d="M5 12h14M13 6l6 6-6 6" />,
  },
  decision: {
    label: "Decision",
    bubble: "bg-lime text-ink",
    icon: <><path d="M4 12.5V5h7.5L20 13.5 13.5 20z" /><circle cx="8.5" cy="8.5" r="1.3" /></>,
  },
  notify: {
    label: "Milestone",
    bubble: "bg-ink text-lime",
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
/** What failed, where, and a link to the exact n8n run: so a stuck ad is never a mystery. */
function ErrorDetails({ meta }: { meta?: Record<string, unknown> }) {
  if (!meta) return null;
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  const step = s(meta.step), msg = s(meta.msg), url = s(meta.url), kind = s(meta.kind);
  if (!step && !msg && !url) return null;
  return (
    <details className="mt-1.5 rounded-[12px] bg-alert-soft/60 px-3 py-2 text-[12.5px] text-moss">
      <summary className="cursor-pointer font-semibold text-alert">Details</summary>
      <dl className="mt-1.5 space-y-1 font-mono text-[11.5px] leading-snug">
        {step && <div><dt className="inline text-mute">step </dt><dd className="inline">{step}</dd></div>}
        {kind && <div><dt className="inline text-mute">type </dt><dd className="inline">{kind}</dd></div>}
        {msg && <div className="break-words"><dt className="inline text-mute">reason </dt><dd className="inline">{msg}</dd></div>}
      </dl>
      {url && <a href={url} target="_blank" rel="noreferrer" className="mt-1.5 inline-block font-semibold text-ink underline">Open this run in n8n</a>}
    </details>
  );
}

export function AgentLog({ item, limit }: { item: Item; limit?: number }) {
  const events = [...item.events].reverse().slice(0, limit);
  if (!events.length) {
    return <p className="rounded-[20px] bg-card p-6 text-center text-moss shadow-soft">Nothing yet. Every step Poof takes shows up here.</p>;
  }
  return (
    <ol className="relative rounded-[20px] bg-card px-3 py-2 shadow-soft">
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
              <p className="mt-0.5 text-[12px] font-bold text-moss">
                {k.label} · <span className="font-normal">{stamp(e.ts)}</span>
              </p>
              {e.type === "error" && <ErrorDetails meta={e.meta} />}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
