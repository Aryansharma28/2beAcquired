import type { Metadata } from "next";
import { Consent } from "@/components/Connect";
import { BackButton, Eyebrow, PlatformLogo } from "@/components/ui";

export const metadata: Metadata = { title: "Poof Connector" };

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Download Poof Connector",
    body: <>Get the zip below and unzip it somewhere you&apos;ll keep it (for example Documents).</>,
  },
  {
    title: "Add it to Chrome",
    body: <>Open <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-[13px]">chrome://extensions</code>, switch on <strong>Developer mode</strong> (top right), click <strong>Load unpacked</strong> and pick the unzipped folder. Pin it from the puzzle icon.</>,
  },
  {
    title: "Log in to Marktplaats",
    body: <>Go to <strong>marktplaats.nl</strong> and log in as you normally do. Poof never sees your password.</>,
  },
  {
    title: "Enter your code",
    body: <>Click the Poof icon, type the 6-digit code from the Poof app and tap <strong>Allow</strong>. The app switches to &ldquo;Connected&rdquo; within seconds.</>,
  },
];

/** How to install the Poof Connector (Chrome extension, laptop). */
export default function ConnectorPage() {
  return (
    <main className="flex flex-1 flex-col px-5 pb-16 pt-[max(16px,env(safe-area-inset-top))]">
      <header className="flex items-center gap-3 py-2">
        <BackButton />
      </header>

      <section className="pb-6 pt-4">
        <Eyebrow className="flex items-center gap-2"><PlatformLogo platform="marktplaats" className="!size-5" /> For your laptop</Eyebrow>
        <h1 className="q" style={{ marginTop: 8 }}>Poof <span className="pb">Connector</span></h1>
        <p className="sub" style={{ margin: 0 }}>
          A small Chrome extension that links your Marktplaats account to Poof. You log in yourself; the Connector hands Poof your logged-in session and keeps it fresh.
        </p>
      </section>

      <a href="/poof-connector.zip" download className="btn">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
        Download poof-connector.zip
      </a>
      <p className="mt-2 text-center text-[13px] text-moss">Chrome, Edge or Brave on a laptop or desktop.</p>

      {/* Numbered steps: the same card as onboarding's "how it works". */}
      <ol className="steps card divided" style={{ boxShadow: "var(--shadow-soft)", marginTop: 24 }}>
        {STEPS.map((s, i) => (
          <li key={s.title} className="step" data-state="running" style={{ background: "none" }}>
            <span className="st-ico" style={{ color: "var(--ink)", fontWeight: 800, fontSize: 13 }}>{i + 1}</span>
            <div className="grow">
              <b>{s.title}</b>
              <span className="small muted" style={{ display: "block", marginTop: 2 }}>{s.body}</span>
            </div>
          </li>
        ))}
      </ol>

      <Consent className="mt-6" />
    </main>
  );
}
