import { GovernPanel } from "@/components/GovernPanel";
import { PageHeader } from "@/components/PageHeader";

export default function GovernPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <PageHeader eyebrow="Governance · propose, vote, commit" title="The Moot" />
      </header>
      <GovernPanel />
    </div>
  );
}
