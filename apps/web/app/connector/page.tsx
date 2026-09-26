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
        <Eyebrow className="flex items-center gap-2"><PlatformLogo platform="marktplaats" className="!size-5" /> For your laptop</Eyebrow>
        <h1 className="mt-2 text-[30px] font-extrabold leading-tight tracking-[-0.02em]">poof <span className="marker">Connector</span></h1>
        <p className="mt-3 text-[15px] leading-snug text-moss">
          A small Chrome extension that links your Marktplaats account to Poof. You log in yourself; the Connector hands Poof your logged-in session and keeps it fresh.
        </p>
      </section>

      <a
        href="/poof-connector.zip"
        download
        className="flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-ink px-5 text-[16px] font-bold text-lime transition active:scale-[0.97]"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
        Download poof-connector.zip
      </a>
      <p className="mt-2 text-center text-[13px] text-moss">Chrome, Edge or Brave on a laptop or desktop.</p>

      <ol className="mt-6 space-y-2.5">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3.5 rounded-[20px] bg-card p-4 shadow-soft">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-lime text-[14px] font-extrabold text-ink">{i + 1}</span>
            <div>
              <p className="text-[17px] font-bold leading-tight">{s.title}</p>
              <p className="mt-1 text-[14.5px] leading-snug text-moss">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <Consent className="mt-6" />
    </main>
  );
}
