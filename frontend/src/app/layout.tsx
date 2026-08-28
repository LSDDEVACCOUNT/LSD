import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";
import { NetworkBanner } from "@/components/NetworkBanner";
import { SherwoodEgg } from "@/components/SherwoodEgg";
import { PriceField } from "@/components/PriceField";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LSD · Liquid Supply Dollar",
  description: "An elastic-supply dollar with a treasury floor, on Robinhood Chain.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Providers>
          <PriceField />
          <Nav />
          <NetworkBanner />
          <SherwoodEgg />
          <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8">{children}</main>
          <footer className="border-t border-white/[0.06] px-5 py-6 sm:px-8">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between text-xs text-haze">
              <span className="font-mono tracking-[0.18em]">LIQUID SUPPLY DOLLAR · £SD</span>
              <span>Robinhood Chain</span>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
