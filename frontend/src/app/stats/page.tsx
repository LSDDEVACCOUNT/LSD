import { RegulationPanel } from "@/components/RegulationPanel";
import { PageHeader } from "@/components/PageHeader";

export default function StatsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <PageHeader eyebrow="Regulation &amp; supply" title="The Watch" />
      </header>
      <RegulationPanel />
    </div>
  );
}
