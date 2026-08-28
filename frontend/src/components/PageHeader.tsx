"use client";

import { useNaming, PLAIN } from "@/config/naming";

/**
 * Page heading in the active vocabulary. In Sherwood mode the lore name is
 * the title with the descriptive eyebrow above it; translated, the plain
 * term takes the title and the lore name moves up into the eyebrow, so
 * neither is ever lost.
 */
export function PageHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  const { plain } = useNaming();
  const translated = PLAIN[title];

  const showPlain = plain && translated;
  return (
    <div>
      <p className="eyebrow">{showPlain ? title : eyebrow}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-chalk">
        {showPlain ? translated : title}
      </h1>
    </div>
  );
}
