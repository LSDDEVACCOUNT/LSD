import { PoolPanel } from "@/components/PoolPanel";
import { PageHeader } from "@/components/PageHeader";

export default function LiquidityPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <PageHeader eyebrow="Liquidity · Uniswap V4 pools" title="Quivers" />
      </header>
      <PoolPanel />
    </div>
  );
}
