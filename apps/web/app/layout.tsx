import type { Metadata, Viewport } from "next";
import { Baloo_2, Figtree } from "next/font/google";
import { SwRegister } from "@/components/SwRegister";
import "./globals.css";

// Poof styleguide: Figtree for everything, Baloo 2 (800) for the wordmark only.
const body = Figtree({ variable: "--font-figtree", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const brand = Baloo_2({ variable: "--font-baloo", subsets: ["latin"], weight: ["800"] });

export const metadata: Metadata = {
  title: "poof — Snap it. poof. Sold.",
  description: "Snap it. poof. Sold. Your agent prices, lists, haggles and plans the pickup on Marktplaats.",
  applicationName: "poof",
  appleWebApp: { capable: true, title: "poof", statusBarStyle: "default" },
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
        <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col">{children}</div>
        <SwRegister />
      </body>
    </html>
  );
}
