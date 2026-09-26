import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { SwRegister } from "@/components/SwRegister";
import "./globals.css";

const display = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });
const body = Instrument_Sans({ variable: "--font-instrument", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["500", "700"] });

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
  themeColor: "#2b3bff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable} antialiased`}>
      <body>
        <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col">{children}</div>
        <SwRegister />
      </body>
    </html>
  );
}
