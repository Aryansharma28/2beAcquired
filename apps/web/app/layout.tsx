import type { Metadata, Viewport } from "next";
import { Baloo_2, Figtree } from "next/font/google";
import { SwRegister } from "@/components/SwRegister";
import "./globals.css";

// Poof styleguide: Figtree for everything, Baloo 2 (800) for the wordmark only.
const body = Figtree({ variable: "--font-figtree", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const brand = Baloo_2({ variable: "--font-baloo", subsets: ["latin"], weight: ["800"] });

export const metadata: Metadata = {
  title: "poof — Snap it. poof. Sold.",
  description: "Snap it. poof. Sold. Poof prices, lists, haggles and plans the pickup on Marktplaats.",
  applicationName: "poof",
  appleWebApp: { capable: true, title: "Poof", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#f4f6f4",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${brand.variable} antialiased`}>
      <body>
        {/* Icon sprite from design/visual/prototype.html; use it with <Icon name="…" /> from components/ui. */}
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <symbol id="i-close" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>
        <symbol id="i-back" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></symbol>
        <symbol id="i-right" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></symbol>
        <symbol id="i-down" viewBox="0 0 24 24"><path d="M5 9l7 7 7-7"/></symbol>
        <symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></symbol>
        <symbol id="i-edit" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></symbol>
        <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
        <symbol id="i-minus" viewBox="0 0 24 24"><path d="M5 12h14"/></symbol>
        <symbol id="i-grid" viewBox="0 0 24 24"><rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/></symbol>
        <symbol id="i-gallery" viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M4 18l5-5 4 4 3-3 4 4"/></symbol>
        <symbol id="i-flash" viewBox="0 0 24 24"><path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z"/></symbol>
        <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"/><path d="M8.8 12l2.2 2.2 4.2-4.4"/></symbol>
        <symbol id="i-send" viewBox="0 0 24 24"><path d="M4 12l16-8-6 16-2.5-6.5L4 12z"/></symbol>
        <symbol id="i-pin" viewBox="0 0 24 24"><path d="M12 21s-6-5.5-6-11a6 6 0 1 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/></symbol>
        <symbol id="i-box" viewBox="0 0 24 24"><path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5v-9z"/><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9"/></symbol>
        <symbol id="i-swap" viewBox="0 0 24 24"><path d="M7 7h11l-3-3M17 17H6l3 3"/></symbol>
        <symbol id="i-chat" viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4V5z"/></symbol>
        <symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.8 4-5.6 7.5-5.6s6.3 1.8 7.5 5.6"/></symbol>
        <symbol id="i-more" viewBox="0 0 24 24"><circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/></symbol>
        <symbol id="i-cta-arrow" viewBox="0 0 24 24"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></symbol>
        <symbol id="i-mail" viewBox="0 0 24 24"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M4.5 7l7.5 6 7.5-6"/></symbol>
        <symbol id="i-bell"viewBox="0 0 24 24"><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15l1.5-2z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/></symbol>
        <symbol id="i-cloudmark" viewBox="34 24 138 116"><g fill="currentColor"><circle cx="66" cy="88" r="32"/><circle cx="100" cy="62" r="38"/><circle cx="134" cy="84" r="32"/><circle cx="150" cy="106" r="22"/><circle cx="100" cy="110" r="30"/><circle cx="60" cy="112" r="20"/></g></symbol>
        </svg>
        <div id="app-shell">
          <div id="phone-wrap">
            <div id="phone">
              <div id="phone-scroll">
                <div className="app-col">{children}</div>
              </div>
            </div>
          </div>
        </div>
        <SwRegister />
      </body>
    </html>
  );
}
