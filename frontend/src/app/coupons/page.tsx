import { CouponsPanel } from "@/components/CouponsPanel";
import { PageHeader } from "@/components/PageHeader";

export default function CouponsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <PageHeader eyebrow="Coupons · below the peg" title="Tallies" />
      </header>
      <CouponsPanel />
    </div>
  );
}
