"use client";

import { useProtocol } from "@/hooks/useProtocol";
import { formatAmount } from "@/lib/format";
import { Panel, Stat, StatRow } from "./ui";

export function SupplyStrip() {
  const { dollarSupply, totalBonded, totalDebt, totalCoupons } = useProtocol();


  return (
    <Panel title="Supply">
      <StatRow>
        <Stat label="LSD supply" value={formatAmount(dollarSupply, 18, 2)} />
        <Stat label="LSDS bonded" value={formatAmount(totalBonded, 18, 2)} />
        <Stat label="Total debt" value={formatAmount(totalDebt, 18, 2)} unit="LSD" />
        <Stat label="Coupons" value={formatAmount(totalCoupons, 18, 2)} />
      </StatRow>
    </Panel>
  );
}
