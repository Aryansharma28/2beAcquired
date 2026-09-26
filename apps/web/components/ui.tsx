"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { PLATFORM, STATUS, eur } from "@/lib/format";
import type { Platform, Status } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("font-display font-extrabold tracking-[-0.04em]", className)}>
      <span className="text-cobalt">2be</span>Acquired
    </span>
  );
}

const TONES = {
  cobalt: "bg-cobalt-soft text-cobalt-deep",
  tag: "bg-tag text-ink",
  go: "bg-go-soft text-go",
  alert: "bg-alert text-white",
  mute: "bg-line text-ink-2",
};

export function StatusPill({ status, className }: { status: Status; className?: string }) {
  const s = STATUS[status] ?? STATUS.error;
  const live = status === "analyzing" || status === "publishing" || status === "negotiating" || status === "needs_you";
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold", TONES[s.tone], className)}>
      {live && <span className="size-1.5 animate-blink rounded-full bg-current" />}
      {s.label}
    </span>
  );
}

const PLATFORM_DOT: Record<Platform, string> = { marktplaats: "bg-[#f59a23]", ebay: "bg-[#3665f3]" };

export function PlatformDot({ platform, className }: { platform: Platform; className?: string }) {
  return <span className={cx("inline-block size-2 shrink-0 rounded-full", PLATFORM_DOT[platform], className)} />;
}

export function ListingPill({ platform, status }: { platform: Platform; status: "pending" | "live" | "removed" | "error" }) {
  const text = {
    pending: `Publishing to ${PLATFORM[platform]}`,
    live: `Live on ${PLATFORM[platform]}`,
    removed: `Removed from ${PLATFORM[platform]}`,
    error: `${PLATFORM[platform]} failed`,
  }[status];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors duration-500",
        status === "live" && "border-go/30 bg-go-soft text-go",
        status === "pending" && "border-line bg-card text-ink-2",
        status === "removed" && "border-line bg-paper text-mute line-through decoration-1",
        status === "error" && "border-alert/40 bg-alert-soft text-alert",
      )}
    >
      {status === "pending" ? (
        <span className="size-3 animate-spin rounded-full border-2 border-line border-t-cobalt" />
      ) : (
        <PlatformDot platform={platform} className={status === "live" ? "animate-blink" : ""} />
      )}
      {text}
    </span>
  );
}

/** The signature: a yellow swing-tag sticker with a punched hole. */
export function PriceTag({
  amount, label, size = "md", className, tilt = -3,
}: { amount?: number; label?: string; size?: "sm" | "md" | "lg" | "xl"; className?: string; tilt?: number }) {
  const sz = {
    sm: "pl-5 pr-2.5 py-1 text-[15px]",
    md: "pl-7 pr-3.5 py-1.5 text-[22px]",
    lg: "pl-10 pr-5 py-2.5 text-[40px]",
    xl: "pl-14 pr-7 py-4 text-[76px]",
  }[size];
  const hole = { sm: "left-2 size-1.5", md: "left-2.5 size-2.5", lg: "left-3.5 size-3.5", xl: "left-5 size-5" }[size];
  return (
    <span
      className={cx("relative inline-flex flex-col items-start bg-tag font-mono font-bold leading-none text-ink shadow-[0_2px_0_rgba(11,13,18,0.18)]", sz, className)}
      style={{
        transform: `rotate(${tilt}deg)`,
        clipPath: "polygon(14% 0, 100% 0, 100% 100%, 14% 100%, 0 50%)",
        borderRadius: 4,
      }}
    >
      <span className={cx("absolute top-1/2 -translate-y-1/2 rounded-full bg-paper shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)]", hole)} />
      {label && <span className="mb-1 font-sans text-[0.32em] font-bold uppercase tracking-[0.14em] text-ink/70">{label}</span>}
      <span className="tabular tracking-[-0.03em]">{eur(amount)}</span>
    </span>
  );
}

export function Button({
  children, onClick, variant = "primary", className, disabled, type = "button", href,
}: {
  children: ReactNode; onClick?: () => void; variant?: "primary" | "ink" | "ghost" | "danger" | "go";
  className?: string; disabled?: boolean; type?: "button" | "submit"; href?: string;
}) {
  const cls = cx(
    "relative inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-[16px] font-semibold transition-all duration-200 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100",
    variant === "primary" && "bg-cobalt text-white shadow-[0_6px_20px_-6px_rgba(43,59,255,0.7)]",
    variant === "ink" && "bg-ink text-white",
    variant === "go" && "bg-go text-white",
    variant === "danger" && "bg-alert-soft text-alert",
    variant === "ghost" && "bg-card text-ink ring-1 ring-line",
    className,
  );
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return <button type={type} onClick={onClick} disabled={disabled} className={cls}>{children}</button>;
}

export function Segmented<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; dot?: boolean }[] }) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className="relative grid rounded-2xl bg-line/70 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      <span
        className="absolute inset-y-1 left-1 rounded-xl bg-card shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.3,1.2,0.5,1)]"
        style={{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${idx * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            "relative z-10 flex items-center justify-center gap-1.5 rounded-xl py-2 text-[14px] font-semibold transition-colors",
            o.value === value ? "text-ink" : "text-mute",
          )}
        >
          {o.label}
          {o.dot && <span className="size-1.5 rounded-full bg-alert" />}
        </button>
      ))}
    </div>
  );
}

export function Tick({ className, delay = 0 }: { className?: string; delay?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={cx("tick", className)} fill="none" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ animationDelay: `${delay}ms` }} />
    </svg>
  );
}

export function BackButton({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} aria-label="Back" className="grid size-10 place-items-center rounded-full bg-card ring-1 ring-line transition active:scale-95">
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </Link>
  );
}
