"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectWallet } from "./ConnectWallet";
import { CoinMark } from "./CoinMark";
import { useNaming, PLAIN } from "@/config/naming";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/portfolio", label: "Spoils" },
  { href: "/wallet", label: "The Band" },
  { href: "/liquidity", label: "Quivers" },
  { href: "/bonds", label: "Pledges" },
  { href: "/trade", label: "Trade" },
  { href: "/coupons", label: "Tallies" },
  { href: "/stats", label: "The Watch" },
  { href: "/govern", label: "The Moot" },
  { href: "/docs", label: "Docs" },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { plain, toggle, dub } = useNaming();

  // A tap that navigates should also close the menu; route change covers
  // back/forward too.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-ink/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-8 md:gap-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <CoinMark idPrefix="nav" className="h-7 w-7 drop-shadow-[0_0_10px_rgba(227,179,65,0.5)]" />
          <span className="font-mono text-sm font-semibold tracking-[0.18em] text-chalk">LSD</span>
        </Link>

        {/* Desktop: the full link row. Each link lays both vocabularies
            invisibly on top of each other and shows the active one, so it
            always occupies the width of the longer label: translating
            changes no spacing, no font, no line count. Below xl the burger
            takes over. */}
        <nav className="hidden flex-1 flex-nowrap items-center gap-1 xl:flex">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            const lore = link.label;
            const translated = PLAIN[lore] ?? lore;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`grid whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  active ? "bg-white/[0.08] text-chalk" : "text-haze hover:text-chalk"
                }`}
              >
                <span aria-hidden className="invisible col-start-1 row-start-1">{lore}</span>
                <span aria-hidden className="invisible col-start-1 row-start-1">{translated}</span>
                <span className="col-start-1 row-start-1 justify-self-center">{plain ? translated : lore}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={toggle}
            className="hidden whitespace-nowrap rounded-lg border border-white/10 px-3 py-1.5 text-xs text-haze transition-colors hover:text-chalk xl:grid"
            title={plain ? "Back to the Sherwood names" : "Plain names for every heading"}
          >
            <span aria-hidden className="invisible col-start-1 row-start-1">Translate</span>
            <span className="col-start-1 row-start-1 justify-self-center">{plain ? "Sherwood" : "Translate"}</span>
          </button>
          <ConnectWallet />

          {/* Phone: a burger that folds the same links out below. */}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-chalk xl:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              {open ? (
                <path d="M3 3l12 12M15 3L3 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-white/[0.07] px-4 pb-4 pt-2 xl:hidden">
          <div className="grid grid-cols-2 gap-1">
            {LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    active ? "bg-white/[0.08] text-chalk" : "text-haze"
                  }`}
                >
                  {dub(link.label)}
                </Link>
              );
            })}
          </div>
          <button
            onClick={toggle}
            className="mt-2 w-full rounded-lg border border-white/10 px-3 py-2.5 text-sm text-haze"
          >
            {plain ? "Sherwood names" : "Translate the names"}
          </button>
        </nav>
      )}
    </header>
  );
}
