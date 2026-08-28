import { BondsPanel } from "@/components/BondsPanel";
import { PageHeader } from "@/components/PageHeader";

export default function BondsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <PageHeader eyebrow="Treasury bonds" title="Pledges" />
      </header>
      <BondsPanel />
    </div>
  );
}
