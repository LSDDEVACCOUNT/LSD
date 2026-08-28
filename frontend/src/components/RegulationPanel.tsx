"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { useProtocol } from "@/hooks/useProtocol";
import { useAddresses } from "@/hooks/useAddresses";
import { usePools } from "@/hooks/usePools";
import { erc20Abi, implementationAbi } from "@/config/abis";
import { formatAmount, formatPercent, formatTimestamp } from "@/lib/format";
import { EpochCard } from "./EpochCard";
import { Panel, Stat, StatRow } from "./ui";
import { supportedChains } from "@/config/chains";

export function RegulationPanel() {
  const { addresses, chainId, configured } = useAddresses();
  const {
    epoch,
    epochPeriod,
    epochStart,
    dollarSupply,
    lsdsSupply,
    totalBonded,
    totalStaged,
    totalDebt,
    totalRedeemable,
    totalCoupons,
    price,
  } = useProtocol();
  const { data: supplyLimit } = useReadContract({
    address: addresses?.root,
    abi: implementationAbi,
    functionName: "supplyLimit",
    query: { enabled: configured, refetchInterval: 15_000 },
  });


  // Circulating = everything not sitting inside the protocol: total supply
  // less the DAO's own balance (bonded + staged + redeemable) and each LP
  // pool's balance (unclaimed rewards). Read rather than configured, so a
  // pool added by governance is subtracted automatically.
  const { pools } = usePools();
  const { data: heldData } = useReadContracts({
    contracts: [{ address: addresses?.dollar, abi: erc20Abi, functionName: "balanceOf" as const, args: [addresses?.root] as const }].concat(
      pools.map((p) => ({ address: addresses?.dollar, abi: erc20Abi, functionName: "balanceOf" as const, args: [p.address] as const })),
    ),
    query: { enabled: !!addresses, refetchInterval: 15_000 },
  });
  const held = (heldData ?? []).reduce((sum, x) => sum + ((x.result as bigint | undefined) ?? BigInt(0)), BigInt(0));
  const circulating = dollarSupply !== undefined ? dollarSupply - held : undefined;
  const ONE = BigInt(10) ** BigInt(18);
  const mcap = (amount: bigint | undefined) =>
    amount === undefined || price === undefined ? undefined : (amount * price) / ONE;

  const chain = supportedChains.find((c) => c.id === chainId);
  const explorer = chain?.blockExplorers?.default.url;

  const contracts: [string, string][] = [
    ["DAO (Root)", addresses.root],
    ["LSD token", addresses.dollar],
    ["Counter token", addresses.counter],
    ["LP Pool", addresses.pool],
    ["Oracle Hook", addresses.hook],
  ];

  return (
    <div className="flex flex-col gap-6">
      <EpochCard />

      <Panel title="Market" hint="Circulating leaves out what the protocol itself holds.">
        <StatRow>
          <Stat label="Circulating supply" value={formatAmount(circulating, 18, 2)} unit="LSD" />
          <Stat label="Circulating market cap" value={formatAmount(mcap(circulating), 18, 2)} unit="USDG" accent />
          <Stat label="Fully diluted" value={formatAmount(mcap(dollarSupply), 18, 2)} unit="USDG" />
          <Stat label="Staked" value={formatPercent(totalBonded, dollarSupply)} unit="%" />
        </StatRow>
        <p className="mt-4 text-xs leading-relaxed text-haze">
          Circulating is total supply minus what sits inside the protocol: the DAO&apos;s bonded, staged and
          redeemable balances, and unclaimed pool rewards. One figure is deliberately not shown, a &quot;NAV per
          circulating LSD&quot;. Redemption pays pro rata over the <em>total</em> supply, so backing per LSD on the
          Bonds page is the honest floor. Dividing the treasury by a smaller number would advertise more than a
          redeemer gets.
        </p>
      </Panel>

      <Panel title="Supply">
        <StatRow>
          <Stat label="LSDS supply" value={formatAmount(lsdsSupply, 18, 2)} />
          <Stat label="Bonded" value={formatAmount(totalBonded, 18, 2)} unit="LSD" accent />
          <Stat label="Staged" value={formatAmount(totalStaged, 18, 2)} unit="LSD" />
          <Stat label="Oracle price" value={formatAmount(price, 18, 4)} unit="USDG" />
          <Stat
            label="Expansion limit"
            value={supplyLimit === undefined ? "—" : `${(Number(supplyLimit) / 1e16).toFixed(2)}%`}
          />
        </StatRow>
        <p className="mt-3 text-xs text-haze">
          The limit exits genesis at 10% and holds it while demand carries on; every contraction epoch
          halves it, down to a 2.5% floor. From there it grows by half only in epochs the price pins it,
          so one hot epoch mints 2.5%, not 10%, and the full rate takes about 30 hours to earn back.
        </p>
      </Panel>

      <Panel title="Contraction">
        <StatRow>
          <Stat label="Total debt" value={formatAmount(totalDebt, 18, 2)} unit="LSD" />
          <Stat label="Coupons" value={formatAmount(totalCoupons, 18, 2)} />
          <Stat label="Redeemable" value={formatAmount(totalRedeemable, 18, 2)} unit="LSD" />
        </StatRow>
      </Panel>

      <Panel title="Epochs">
        <StatRow>
          <Stat label="Current epoch" value={epoch !== undefined ? String(epoch) : "—"} />
          <Stat
            label="Epoch length"
            value={epochPeriod !== undefined ? String(Number(epochPeriod) / 60) : "—"}
            unit="min"
          />
          <Stat label="First epoch" value={formatTimestamp(epochStart)} />
        </StatRow>
      </Panel>

      <Panel title="Contracts">
        <ul className="flex flex-col divide-y divide-white/[0.06]">
          {contracts.map(([label, addr]) => (
            <li key={label} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <span className="text-sm text-haze">{label}</span>
              {explorer ? (
                <a
                  href={`${explorer}/address/${addr}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-chalk underline-offset-4 hover:underline"
                >
                  {addr}
                </a>
              ) : (
                <span className="font-mono text-xs text-chalk">{addr}</span>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
