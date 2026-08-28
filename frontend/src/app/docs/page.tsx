import type { Metadata } from "next";
import { DocsReader } from "@/components/DocsReader";

export const metadata: Metadata = {
  title: "Docs · Liquid Supply Dollar",
  description: "The Sherwood Papers: how the LSD protocol works, end to end.",
};

export default function DocsPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="pt-2">
        <p className="eyebrow">Protocol Documentation</p>
        <h1 className="mt-2 text-3xl font-semibold leading-[1.05] tracking-tight sm:text-4xl">
          <span className="gilt-text">The Sherwood Papers</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-haze">
          How the protocol works, one section at a time. Pick a heading, or step through with the arrows.
        </p>
      </header>

      <DocsReader />
    </div>
  );
}
