"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useNaming } from "@/config/naming";

export function Panel({
  title,
  hint,
  action,
  children,
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  // Headings follow the Translate toggle; anything without a plain
  // counterpart in the map passes through unchanged.
  const { dub } = useNaming();
  return (
    <section className="panel p-5 sm:p-6">
      {(title || action) && (
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="eyebrow">{dub(title)}</h2>}
            {hint && <p className="mt-1 text-xs text-haze">{hint}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p
        className={`mt-1 font-mono text-lg leading-tight ${
          accent ? "gilt-text font-semibold" : "text-chalk"
        }`}
      >
        {value}
        {unit && <span className="ml-1 text-xs text-haze">{unit}</span>}
      </p>
    </div>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">{children}</dl>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="eyebrow mb-2">{label}</p>
      {children}
    </div>
  );
}

export function Tile({
  href,
  title,
  blurb,
  glyph,
}: {
  href: string;
  title: string;
  blurb: string;
  glyph: ReactNode;
}) {
  return (
    <Link href={href} className="tile group block p-5">
      <div className="relative flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-chalk">{title}</h3>
          <p className="mt-1.5 max-w-[24ch] text-sm text-haze">{blurb}</p>
        </div>
        <span className="gilt-text shrink-0 text-2xl">{glyph}</span>
      </div>
      <span className="relative mt-5 inline-block text-xs text-haze transition-colors group-hover:text-chalk">
        →
      </span>
    </Link>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn"; children: ReactNode }) {
  const toneClass =
    tone === "warn"
      ? "border-amber-400/30 bg-amber-400/5 text-amber-200"
      : "border-white/10 bg-white/[0.02] text-haze";
  return <div className={`rounded-xl border px-4 py-3 text-sm ${toneClass}`}>{children}</div>;
}

export function ConnectPrompt({ what }: { what: string }) {
  return <p className="text-sm text-haze">Connect a wallet to {what}.</p>;
}
