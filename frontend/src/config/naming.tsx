"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Two vocabularies for the same protocol: the Sherwood names the site ships
 * with, and the plain DeFi terms behind them. The Translate button in the
 * nav flips every heading between them; the choice sticks per browser.
 */

export const PLAIN: Record<string, string> = {
  Spoils: "Portfolio",
  "The Band": "Staking",
  Quivers: "Liquidity",
  Pledges: "Treasury Bonds",
  Tallies: "Coupons",
  "The Watch": "Stats",
  "The Moot": "Governance",
  // Panel headings
  "Join the band": "Bond & unbond",
  "What the band pays": "Staking yield",
  "What the Coffer holds": "What the treasury holds",
  "Reach into the Coffer": "Redeem against the treasury",
  "How the Moot works": "How governance works",
};

type NamingContextValue = {
  plain: boolean;
  toggle: () => void;
  /** The heading in the active vocabulary. */
  dub: (lore: string) => string;
};

const NamingContext = createContext<NamingContextValue>({
  plain: false,
  toggle: () => {},
  dub: (lore) => lore,
});

const STORAGE_KEY = "lsd.naming";

export function NamingProvider({ children }: { children: ReactNode }) {
  const [plain, setPlain] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "plain") setPlain(true);
    } catch {
      /* storage unavailable: default vocabulary */
    }
  }, []);

  const toggle = useCallback(() => {
    setPlain((v) => {
      const next = !v;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "plain" : "lore");
      } catch {
        /* fine, just not sticky */
      }
      return next;
    });
  }, []);

  const dub = useCallback((lore: string) => (plain ? (PLAIN[lore] ?? lore) : lore), [plain]);

  return <NamingContext.Provider value={{ plain, toggle, dub }}>{children}</NamingContext.Provider>;
}

export function useNaming(): NamingContextValue {
  return useContext(NamingContext);
}
