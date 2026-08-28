import { WalletPanel } from "@/components/WalletPanel";
import { PageHeader } from "@/components/PageHeader";
import { EpochCard } from "@/components/EpochCard";

export default function WalletPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <PageHeader eyebrow="Staking · the DAO" title="The Band" />
      </header>
      <EpochCard />
      <WalletPanel />
    </div>
  );
}
