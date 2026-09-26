import type { Metadata } from "next";
import { BackButton, Eyebrow } from "@/components/ui";

export const metadata: Metadata = { title: "poof privacy" };

const SECTIONS: { title: string; body: string }[] = [
  { title: "What poof does", body: "poof sells second-hand items for you on the marketplaces you connect. It writes the ad, posts it, answers buyers, negotiates within the minimum price you set, plans the pickup and removes the ad once it is sold." },
  { title: "What we store", body: "Your name, pickup city, pickup address and pickup hours; the photos and details of items you sell; the messages with buyers about those items; and the access poof needs to act on your marketplace accounts (a Marktplaats session from the poof Connector, or an eBay access token from eBay's own login). We never ask for or store your passwords." },
  { title: "Who sees it", body: "Your pickup address is only shared with a buyer after a price and a pickup time are agreed. Item data is processed by the services that run poof: Vercel (the app), n8n (the agent's workflows), Apify (marketplace automation and photo storage) and Groq (the language model). We do not sell your data." },
  { title: "Disconnecting and deleting", body: "Disconnect a marketplace any time in poof Settings; poof deletes the stored access right away. When eBay tells us an eBay account was deleted, we delete that account's eBay data. To delete everything else, ask us and we remove your account and items." },
  { title: "Contact", body: "Questions or deletion requests: aryansharma2k2@gmail.com" },
];

/** Privacy policy (also the URL eBay requires for "Connect eBay"). */
export default function PrivacyPage() {
  return (
    <main className="flex flex-1 flex-col px-5 pb-16 pt-[max(16px,env(safe-area-inset-top))]">
      <header className="flex items-center gap-3 py-2">
        <BackButton href="/" />
      </header>
      <Eyebrow className="mt-4">Privacy</Eyebrow>
      <h1 className="mt-1 font-display text-[34px] font-extrabold leading-[1.05] tracking-[-0.03em]">How poof handles your data</h1>
      <div className="mt-6 space-y-5">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="font-display text-[19px] font-bold tracking-[-0.02em]">{s.title}</h2>
            <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{s.body}</p>
          </section>
        ))}
      </div>
      <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.1em] text-mute">Last updated 26 September 2026</p>
    </main>
  );
}
