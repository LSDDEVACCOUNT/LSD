import { PortfolioPanel } from "@/components/PortfolioPanel";
import { PageHeader } from "@/components/PageHeader";

export default function PortfolioPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <PageHeader eyebrow="Portfolio · your claim on the Coffer" title="Spoils" />
      </header>
      <PortfolioPanel />
    </div>
  );
}
