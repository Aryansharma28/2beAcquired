import type { Metadata } from "next";
import { Consent } from "@/components/Connect";
import { BackButton, Eyebrow, PlatformLogo } from "@/components/ui";

export const metadata: Metadata = { title: "poof Connector" };

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Download poof Connector",
    body: <>Get the zip below and unzip it somewhere you&apos;ll keep it (for example Documents).</>,
  },
  {
    title: "Add it to Chrome",
    body: <>Open <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-[13px]">chrome://extensions</code>, switch on <b>Developer mode</b> (top right), click <b>Load unpacked</b> and pick the unzipped folder. Pin it from the puzzle icon.</>,
  },
  {
    title: "Log in to Marktplaats",
    body: <>Go to <b>marktplaats.nl</b> and log in as you normally do. poof never sees your password.</>,
  },
  {
    title: "Enter your code",
    body: <>Click the poof icon, type the 6-digit code from the poof app and tap <b>Allow</b>. The app switches to &ldquo;Connected&rdquo; within seconds.</>,
  },
];

/** How to install the poof Connector (Chrome extension, laptop). */
export default function ConnectorPage() {
  return (
    <main className="flex flex-1 flex-col px-5 pb-16 pt-[max(16px,env(safe-area-inset-top))]">
      <header className="flex items-center gap-3 py-2">
        <BackButton />
      </header>

      <section className="pb-6 pt-4">
        <Eyebrow className="flex items-center gap-2"><PlatformLogo platform="marktplaats" className="!size-4 !text-[9px]" /> For your laptop</Eyebrow>
        <h1 className="mt-1 font-display text-[40px] font-extrabold leading-[0.95] tracking-[-0.045em]">poof Connector</h1>
        <p className="mt-3 text-[16px] leading-snug text-ink-2">
          A small Chrome extension that links your Marktplaats account to poof. You log in yourself; the Connector hands poof your logged-in session and keeps it fresh.
        </p>
      </section>

      <a
        href="/poof-connector.zip"
        download
        className="flex items-center justify-center gap-2 rounded-2xl bg-cobalt px-5 py-4 text-[18px] font-semibold text-white shadow-[0_6px_20px_-6px_rgba(43,59,255,0.7)] transition active:scale-[0.97]"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
        Download poof-connector.zip
      </a>
      <p className="mt-2 text-center text-[13px] text-mute">Chrome, Edge or Brave on a laptop or desktop.</p>

      <ol className="mt-6 space-y-2.5">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3.5 rounded-[22px] bg-card p-4 shadow-soft">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink font-mono text-[13px] font-bold text-white">{i + 1}</span>
            <div>
              <p className="font-display text-[18px] font-bold leading-tight tracking-[-0.02em]">{s.title}</p>
              <p className="mt-1 text-[14.5px] leading-snug text-ink-2">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <Consent className="mt-6" />
    </main>
  );
}
