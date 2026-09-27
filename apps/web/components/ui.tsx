"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { PLATFORM, STATUS, eur } from "@/lib/format";
import type { Platform, Status } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/** Poof cloud mark (styleguide "Mark"). */
export function CloudMark({ className }: { className?: string }) {
  return (
    <svg viewBox="34 24 138 116" className={className} aria-hidden fill="currentColor">
      <circle cx="66" cy="88" r="32" /><circle cx="100" cy="62" r="38" /><circle cx="134" cy="84" r="32" />
      <circle cx="150" cy="106" r="22" /><circle cx="100" cy="110" r="30" /><circle cx="60" cy="112" r="20" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-[0.3em] font-brand font-extrabold leading-none tracking-[-0.02em]", className)}>
      <CloudMark className="h-[0.8em] w-auto" />
      Poof
    </span>
  );
}

/** The "POOF" tag that marks what Poof said or suggested. */
export function PoofTag({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex h-[18px] shrink-0 items-center gap-1 whitespace-nowrap rounded-[4px] bg-ink px-1.5 text-[11px] font-extrabold text-lime", className)}>
      <CloudMark className="h-[9px] w-auto" />POOF
    </span>
  );
}

const TONES = {
  cobalt: "bg-limetint text-ink",
  tag: "bg-lime text-ink",
  go: "bg-card text-ink shadow-soft",
  alert: "bg-alert text-white",
  mute: "bg-card text-moss shadow-soft",
};

export function StatusPill({ status, className }: { status: Status; className?: string }) {
  const s = STATUS[status] ?? STATUS.error;
  const live = status === "live" || status === "negotiating" || status === "needs_you";
  return (
    <span className={cx("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] font-bold", TONES[s.tone], className)}>
      {s.tone !== "alert" && <span className={cx("size-[7px] rounded-full", s.tone === "mute" ? "bg-moss" : "bg-ink", live && "animate-blink")} />}
      {s.label}
    </span>
  );
}

const PLATFORM_DOT: Record<Platform, string> = { marktplaats: "bg-[#f59a23]", ebay: "bg-[#e53238]" };

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
        "inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors duration-500",
        status === "live" && "bg-limetint text-ink",
        status === "pending" && "bg-card text-moss shadow-soft",
        status === "removed" && "bg-page text-moss line-through decoration-1",
        status === "error" && "bg-alert-soft text-alert",
      )}
    >
      {status === "pending" ? (
        <span className="size-3 animate-spin rounded-full border-2 border-line border-t-ink" />
      ) : (
        <PlatformDot platform={platform} className={status === "live" ? "animate-blink" : ""} />
      )}
      {text}
    </span>
  );
}

/** The signature: a lime paper price tag with a notch, a punched hole and (optionally) its string. */
export function PriceTag({
  amount, label, size = "md", className, tilt = -3, string, dark,
}: { amount?: number; label?: string; size?: "sm" | "md" | "lg" | "xl"; className?: string; tilt?: number; string?: boolean; dark?: boolean }) {
  const sz = { sm: "text-[13px]", md: "text-[18px]", lg: "text-[30px]", xl: "text-[54px]" }[size];
  return (
    <span className={cx("ptag", string && "string", dark && "dark", sz, className)} style={{ ["--tilt" as string]: `${tilt}deg` }}>
      {label && <span className="mb-[0.15em] text-[0.5em] font-bold opacity-70">{label}</span>}
      <span className="tabular">{eur(amount)}</span>
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
    "relative inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full px-5 py-3 text-[16px] font-bold transition-all duration-200 active:scale-[0.97] disabled:bg-line disabled:text-moss disabled:shadow-none disabled:active:scale-100",
    (variant === "primary" || variant === "ink" || variant === "go") && "bg-ink text-lime",
    variant === "danger" && "bg-alert-soft text-alert",
    variant === "ghost" && "bg-card text-ink shadow-soft",
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
    <div className="relative grid rounded-full bg-card p-1 shadow-soft" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      <span
        className="absolute inset-y-1 left-1 rounded-full bg-lime transition-transform duration-300 ease-[cubic-bezier(0.3,1.2,0.5,1)]"
        style={{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${idx * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            "relative z-10 flex min-h-[44px] items-center justify-center gap-1.5 rounded-full text-[14px] font-semibold transition-colors",
            o.value === value ? "text-ink" : "text-moss",
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

/** Round white icon button (styleguide "Icon buttons"). */
export const ICON_BTN = "grid size-11 shrink-0 place-items-center rounded-full bg-card text-ink shadow-soft transition active:scale-95";

export function BackButton({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} aria-label="Back" className={ICON_BTN}>
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m15 18-6-6 6-6" />
      </svg>
    </Link>
  );
}

const LOGO_PATH = {
  vinted: ["#09B1BA", "M19.316 0c-.258 0-.571.217-1.415.953-.3.108-.627.027-1.008.613-2.15 3.09-3.825 14.648-5.255 17.984-.286-1.444-.885-10.837-1.116-13.41-.028-.477.027-1.076.027-1.43 0-2.368-.516-3.567-2.886-3.567-1.198 0-2.382.436-3.008 1.226-.299.408-.409.708-.409 1.443 0 4.915 1.171 12.973 2.478 18.228C7.132 23.688 8.603 24 9.99 24c.654 0 1.307-.081 2.233-.544 3.212-1.567 4.07-5.84 4.9-9.993.15-.749.899-4.37 1.253-6.275.476-2.6 1.02-5.54 1.347-6.617C19.833.245 19.63 0 19.317 0z"],
  ebay: ["#E53238", "M6.056 12.132v-4.92h1.2v3.026c.59-.703 1.402-.906 2.202-.906 1.34 0 2.828.904 2.828 2.855 0 .233-.015.457-.06.668.24-.953 1.274-1.305 2.896-1.344.51-.018 1.095-.018 1.56-.018v-.135c0-.885-.556-1.244-1.53-1.244-.72 0-1.245.3-1.305.81h-1.275c.136-1.29 1.5-1.62 2.686-1.62 1.064 0 1.995.27 2.415 1.02l-.436-.84h1.41l2.055 4.125 2.055-4.126H24l-3.72 7.305h-1.346l1.07-2.04-2.33-4.38c.13.255.2.555.2.93v2.46c0 .346.01.69.04 1.005H16.8a6.543 6.543 0 01-.046-.765c-.603.734-1.32.96-2.32.96-1.48 0-2.272-.78-2.272-1.695 0-.15.015-.284.037-.405-.3 1.246-1.36 2.086-2.767 2.086-.87 0-1.694-.315-2.2-.93 0 .24-.015.494-.04.734h-1.18c.02-.39.04-.855.04-1.245v-1.05h-4.83c.065 1.095.818 1.74 1.853 1.74.718 0 1.355-.3 1.568-.93h1.24c-.24 1.29-1.61 1.725-2.79 1.725C.95 15.009 0 13.822 0 12.232c0-1.754.982-2.91 3.116-2.91 1.688 0 2.93.886 2.94 2.806v.005zm9.137.183c-1.095.034-1.77.233-1.77.95 0 .465.36.97 1.305.97 1.26 0 1.935-.69 1.935-1.814v-.13c-.45 0-.99.006-1.484.022h.012zm-6.06 1.875c1.11 0 1.876-.806 1.876-2.02s-.768-2.02-1.893-2.02c-1.11 0-1.89.806-1.89 2.02s.765 2.02 1.875 2.02h.03zm-4.35-2.514c-.044-1.125-.854-1.546-1.725-1.546-.944 0-1.694.474-1.815 1.546z"],
  facebook: ["#0866FF", "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"],
} as const;

/** Platform app icon: the real Marktplaats icon, Simple Icons for the others. Size it with a `size-*` class. */
export function PlatformLogo({ platform, className, muted }: { platform: Platform | "vinted" | "facebook"; className?: string; muted?: boolean }) {
  const base = cx("inline-grid size-5 shrink-0 place-items-center overflow-hidden rounded-[28%]", muted && "opacity-35 grayscale", className);
  if (platform === "marktplaats") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/brand/logos/marktplaats.png" alt="" aria-hidden className={cx(base, "object-cover")} />;
  }
  const [bg, d] = LOGO_PATH[platform];
  return (
    <span aria-hidden className={base} style={{ background: bg }}>
      <svg viewBox="0 0 24 24" className="size-[56%]" fill="#fff"><path d={d} /></svg>
    </span>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("text-[12px] font-bold text-moss", className)}>{children}</p>;
}

export function Soon({ className }: { className?: string }) {
  return <span className={cx("whitespace-nowrap rounded-[4px] bg-limetint px-1.5 py-px text-[12px] font-bold text-ink", className)}>Soon</span>;
}

/** Sticky primary action at the bottom of a wizard-style screen. */
export function BottomAction({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[440px] bg-card px-5 pb-[max(18px,env(safe-area-inset-bottom))] pt-3.5">
      {children}
    </div>
  );
}

/** Bottom sheet (the prototype's `.psheet`). */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-root" role="dialog" aria-modal>
      <button aria-label="Close" onClick={onClose} className="psheet-backdrop" />
      <div className="psheet no-scrollbar">
        <div className="row" style={{ marginBottom: 14 }}>
          <h2 className="grow" style={{ margin: 0 }}>{title}</h2>
          <button onClick={onClose} className="icon-btn plain" type="button" aria-label="Close"><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx("inline-block size-4 animate-spin rounded-full border-2 border-current/25 border-t-current", className)} />;
}

export type IconName =
  | "close" | "back" | "right" | "down" | "check" | "edit" | "plus" | "minus" | "grid" | "gallery" | "flash"
  | "shield" | "send" | "pin" | "box" | "swap" | "chat" | "user" | "more" | "cta-arrow";

/** Prototype icon (`ic(name)`): a stroke icon from the sprite in app/layout.tsx. */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return <svg className={cx("icon", className)} aria-hidden="true"><use href={`#i-${name}`} /></svg>;
}

/** Status of an ad as the prototype's home tiles show it (`statusChip` kinds). */
export type ItemStatusKind = "needs" | "negotiating" | "uploading" | "progress" | "new" | "live" | "deal" | "pending" | "sold" | "error";
export type ItemStatus = { kind: ItemStatusKind; label: string };

/** "Sat 14:30" for a pickup slot. */
function pickupLabel(start?: string) {
  if (!start) return null;
  const d = new Date(start);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.toLocaleDateString("en-GB", { weekday: "short" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}

/**
 * Maps a real item status to the prototype's status chip (`airpodsHomeStatus`).
 * A done deal waiting for pickup is `pending`: it stays under Selling until it is picked up.
 */
export function itemStatus(item: { status: Status; pickup?: { start: string } }): ItemStatus {
  switch (item.status) {
    case "sold":
    case "delisted":
      return { kind: "sold", label: "Sold" };
    case "deal":
    case "pickup_scheduled": {
      const when = pickupLabel(item.pickup?.start);
      return { kind: "pending", label: when ? `Deal done · Pickup ${when}` : item.status === "pickup_scheduled" ? "Deal done · Pickup planned" : "Deal done" };
    }
    case "negotiating":
    case "needs_you":
      return { kind: "negotiating", label: "Negotiating" };
    case "live":
      return { kind: "live", label: "Live" };
    case "publishing":
      return { kind: "uploading", label: "Uploading" };
    case "needs_connection":
      return { kind: "needs", label: "Connect Marktplaats" };
    case "ad_ready":
      return { kind: "needs", label: "Check your ad" };
    case "needs_details":
      return { kind: "needs", label: "Needs you" };
    case "writing":
      return { kind: "progress", label: "Writing your ad" };
    case "recognizing":
    case "analyzing":
      return { kind: "progress", label: "Looking at your photos" };
    default:
      return { kind: "error", label: "Something went wrong" };
  }
}

const CHIP_ROW = { gap: 6, display: "inline-flex", alignItems: "center" } as const;
const CHIP_DOT = { width: 7, height: 7 } as const;

/** The prototype's `statusChip(kind, label)`. */
export function StatusChip({ kind, label }: ItemStatus) {
  if (kind === "needs") return <span className="tag" style={{ background: "var(--lime)" }}>{label}</span>;
  if (kind === "negotiating") return <span className="row" style={CHIP_ROW}><span className="typing" aria-hidden="true"><i></i><i></i><i></i></span><span className="xs muted">{label}</span></span>;
  if (kind === "uploading" || kind === "progress") return <span className="row" style={CHIP_ROW}><span className="dot" style={{ ...CHIP_DOT, background: "var(--moss)", animation: "tdot 1.1s infinite ease-in-out" }}></span><span className="xs muted">{label}</span></span>;
  if (kind === "new" || kind === "deal") return <span className="row" style={CHIP_ROW}><span className="dot" style={CHIP_DOT}></span><span className="xs" style={{ fontWeight: 700 }}>{label}</span></span>;
  if (kind === "sold") return <span className="xs muted">{label}</span>;
  if (kind === "pending") return <span className="tag" style={{ background: "var(--limetint)" }}>{label}</span>;
  if (kind === "error") return <span className="tag" style={{ background: "var(--color-alert-soft)", color: "var(--alert)" }}>{label}</span>;
  return <span className="row" style={CHIP_ROW}><span className="dot" style={CHIP_DOT}></span><span className="xs muted">{label}</span></span>;
}
