"use client";

import { useEffect, useState } from "react";

/**
 * A hidden Sherwood layer.
 *
 * The deployed contracts carry Sherwood-forest names: Sherwood the proxy,
 * Loxley the token, the Coffer for the treasury. This is the easter egg that
 * lets the theme through: the Konami code, or seven taps on the hero coin,
 * turns the whole palette Lincoln-green-and-gold, looses a flight of arrows,
 * and names the band. It sticks (localStorage) and toggles back off the same
 * way.
 *
 * Entirely cosmetic: it recolours CSS variables and nothing else touches
 * state or the chain.
 */

const KONAMI = [
  "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
  "b", "a",
];

const STORAGE_KEY = "lsd:sherwood";

export function SherwoodEgg() {
  const [on, setOn] = useState(false);
  const [toast, setToast] = useState(false);
  const [arrows, setArrows] = useState<{ id: number; top: number; delay: number; dur: number }[]>([]);

  // restore
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") apply(true, false);
    } catch {
      /* private mode: no persistence, no problem */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function apply(next: boolean, celebrate: boolean) {
    setOn(next);
    const root = document.documentElement;
    if (next) root.dataset.sherwood = "on";
    else delete root.dataset.sherwood;
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (next && celebrate) {
      setToast(true);
      window.setTimeout(() => setToast(false), 5200);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduce) {
        const flight = Array.from({ length: 16 }, (_, i) => ({
          id: Date.now() + i,
          top: 6 + Math.random() * 82,
          delay: Math.random() * 0.5,
          dur: 0.9 + Math.random() * 0.7,
        }));
        setArrows(flight);
        window.setTimeout(() => setArrows([]), 2200);
      }
    }
  }

  function toggle() {
    apply(!on, !on);
  }

  // Konami listener
  useEffect(() => {
    let idx = 0;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      const want = KONAMI[idx];
      if (e.key.toLowerCase() === want.toLowerCase()) {
        idx += 1;
        if (idx === KONAMI.length) {
          idx = 0;
          toggle();
        }
      } else {
        idx = e.key === KONAMI[0] ? 1 : 0;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  // Seven taps on the hero coin
  useEffect(() => {
    let taps = 0;
    let last = 0;
    function onClick(e: MouseEvent) {
      const el = (e.target as HTMLElement | null)?.closest(".coin-float");
      if (!el) return;
      const now = Date.now();
      taps = now - last < 1200 ? taps + 1 : 1;
      last = now;
      if (taps >= 7) {
        taps = 0;
        toggle();
      }
    }
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  return (
    <>
      {arrows.length > 0 && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
          {arrows.map((a) => (
            <span
              key={a.id}
              className="sherwood-arrow"
              style={{ top: `${a.top}%`, animationDelay: `${a.delay}s`, animationDuration: `${a.dur}s` }}
            >
              ➵
            </span>
          ))}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[61] -translate-x-1/2 px-4">
          <button
            onClick={() => setToast(false)}
            className="panel flex max-w-sm items-start gap-3 px-4 py-3 text-left"
          >
            <span className="mt-0.5 text-lg leading-none">🏹</span>
            <span className="text-sm leading-relaxed text-chalk">
              <b className="gilt-text font-semibold">You found Sherwood.</b> The proxy is{" "}
              <span className="font-mono">Sherwood</span>, the dollar is{" "}
              <span className="font-mono">Loxley</span>, the treasury is the{" "}
              <span className="font-mono">Coffer</span>. Konami again to leave the forest.
            </span>
          </button>
        </div>
      )}
    </>
  );
}
