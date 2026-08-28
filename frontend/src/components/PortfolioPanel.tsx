"use client";

import { useAccount, useReadContracts } from "wagmi";
import { useAddresses } from "@/hooks/useAddresses";
import { useProtocol } from "@/hooks/useProtocol";
import { useReserves } from "@/hooks/useReserves";
import { usePools } from "@/hooks/usePools";
import { useBondHoldings } from "@/hooks/useBondHoldings";
import { erc20Abi, implementationAbi, poolAbi } from "@/config/abis";
import { formatAmount, formatPercent } from "@/lib/format";
import { RedeemPanel } from "./RedeemPanel";
import { ConnectPrompt, Panel, Stat, StatRow } from "./ui";

/**
 * Everything this wallet holds, read as a claim on the treasury.
 *
 * The number the page is built around is simple: your LSD, wherever it sits,
 * times backing per LSD. What the page has to be honest about is the
 * "wherever it sits" - only wallet LSD can be burned for the treasury right
 * now; the rest is a ladder of unstaking steps first. Each row says which.
 */
export function PortfolioPanel() {
  const { addresses } = useAddresses();
  const { address: account } = useAccount();
  const { dollarSupply, refetch: refetchProtocol } = useProtocol();
  const { reserves, refetch: refetchReserves } = useReserves();
  const { pools } = usePools();
  const { holdings, totalVesting, totalReady, refetch: refetchBonds } = useBondHoldings();

  const { data, refetch } = useReadContracts({
    contracts: [
      { address: addresses?.dollar, abi: erc20Abi, functionName: "balanceOf", args: [account!] },
      { address: addresses?.root, abi: implementationAbi, functionName: "balanceOfStaged", args: [account!] },
      { address: addresses?.root, abi: implementationAbi, functionName: "balanceOfBonded", args: [account!] },
      { address: addresses?.root, abi: implementationAbi, functionName: "backingPerDollar" },
      { address: addresses?.counter, abi: erc20Abi, functionName: "symbol" },
    ],
    query: { enabled: !!account, refetchInterval: 12_000 },
  });

  const { data: poolData, refetch: refetchPools } = useReadContracts({
    contracts: pools.flatMap((p) => [
      { address: p.address, abi: poolAbi, functionName: "accounts" as const, args: [account!] as const },
      { address: p.address, abi: poolAbi, functionName: "balanceOfRewarded" as const, args: [account!] as const },
    ]),
    query: { enabled: !!account && pools.length > 0, refetchInterval: 12_000 },
  });

  if (!account) {
    return (
      <Panel title="Spoils">
        <ConnectPrompt what="see your claim on the treasury" />
      </Panel>
    );
  }

  const r = data?.map((x) => x.result);
  const wallet = r?.[0] as bigint | undefined;
  const staged = r?.[1] as bigint | undefined;
  const bonded = r?.[2] as bigint | undefined;
  const backing = r?.[3] as bigint | undefined;
  const counterSymbol = (r?.[4] as string | undefined) ?? "USDG";

  // Pool rewards are LSD; claimable is banked, rewarded still accrues on the
  // bonded position. Both are the wallet's, both count.
  let poolRewards = BigInt(0);
  pools.forEach((_, i) => {
    const acct = poolData?.[i * 2]?.result as readonly bigint[] | undefined;
    const rewarded = poolData?.[i * 2 + 1]?.result as bigint | undefined;
    poolRewards += (acct?.[1] ?? BigInt(0)) + (rewarded ?? BigInt(0));
  });

  const rows: { label: string; amount: bigint | undefined; note: string }[] = [
    { label: "In your wallet", amount: wallet, note: "redeemable now" },
    { label: "Staged in the DAO", amount: staged, note: "withdraw, then redeem" },
    { label: "Bonded in the DAO", amount: bonded, note: "unbond (4 days), withdraw, redeem" },
    { label: "Pool rewards", amount: poolRewards, note: "claim from the pool first" },
    { label: "Bonds, ready to claim", amount: totalReady, note: "claim on the Bonds page" },
    { label: "Bonds, still vesting", amount: totalVesting, note: "wait out the 24 h vest" },
  ];

  const total = rows.reduce((sum, row) => sum + (row.amount ?? BigInt(0)), BigInt(0));
  // Bond claims are IOUs on future supply - the LSD does not exist until
  // claimed. Counting them against today's supply pushes "share" past 100%
  // and prices them at a backing they would themselves dilute, so the share
  // and the redemption floor are computed over minted holdings only. The
  // table above still shows the IOUs as their own rows.
  const minted = total - (totalReady ?? BigInt(0)) - (totalVesting ?? BigInt(0));
  const claimValue = backing === undefined ? undefined : (minted * backing) / BigInt(10) ** BigInt(18);

  const ONE = BigInt(10) ** BigInt(18);

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Your claim" hint="All your LSD, priced at what the Coffer stands behind.">
        <StatRow>
          <Stat label="Total LSD" value={formatAmount(total, 18, 2)} accent />
          <Stat label="Share of supply" value={formatPercent(minted, dollarSupply)} unit="%" />
          <Stat label="Backing per LSD" value={formatAmount(backing, 18, 4)} unit={counterSymbol} />
          <Stat label="Treasury claim" value={formatAmount(claimValue, 18, 2)} unit={counterSymbol} />
        </StatRow>
        <p className="mt-4 text-xs leading-relaxed text-haze">
          The treasury claim is a floor, not a price: the market can pay more, but redemption guarantees this much.
          Coupons are deliberately not counted; they are a bet on the supply expanding, not a claim on the treasury.
        </p>
      </Panel>

      <Panel title="Where it sits" hint="Only wallet LSD can be burned for the treasury directly.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-t border-white/[0.06] first:border-t-0">
                  <td className="py-2.5 text-chalk">{row.label}</td>
                  <td className="py-2.5 text-right tabular-nums">
                    {formatAmount(row.amount, 18, 2)} <span className="text-haze">LSD</span>
                  </td>
                  <td className="py-2.5 pl-6 text-right text-xs text-haze">{row.note}</td>
                </tr>
              ))}
              <tr className="border-t border-white/[0.12]">
                <td className="py-2.5 font-medium text-chalk">Total</td>
                <td className="py-2.5 text-right font-medium tabular-nums text-chalk">
                  {formatAmount(total, 18, 2)} <span className="font-normal text-haze">LSD</span>
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      {reserves.length > 0 && dollarSupply !== undefined && dollarSupply > BigInt(0) && (
        <Panel title="Your slice of the basket" hint="What your total LSD claims out of each reserve.">
          <div className="flex flex-wrap gap-x-10 gap-y-3">
            {reserves.map((res) => (
              <Stat
                key={res.address}
                label={res.symbol}
                value={formatAmount(
                  res.balance === undefined ? undefined : (res.balance * minted) / dollarSupply,
                  res.decimals,
                  6,
                )}
              />
            ))}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-haze">
            Computed exactly the way redeem() computes it, floored the same way, against the supply as it stands. It
            shifts with every bond, sweep, expansion and redemption: a claim on shares of a basket, not a fixed IOU.
          </p>
        </Panel>
      )}

      {holdings.length > 0 && (
        <Panel title="Vesting pledges">
          <div className="flex flex-wrap gap-x-10 gap-y-3">
            {holdings.map((h) => (
              <Stat
                key={String(h.epoch)}
                label={h.ready ? `Ready since epoch ${h.epoch}` : `Unlocks at epoch ${h.epoch}`}
                value={formatAmount(h.amount, 18, 2)}
                unit="LSD"
                accent={h.ready}
              />
            ))}
          </div>
          <p className="mt-4 text-xs text-haze">Claiming lives on the Bonds page.</p>
        </Panel>
      )}

      <RedeemPanel
        root={addresses!.root}
        dollar={addresses!.dollar}
        account={account}
        lsdBalance={wallet}
        totalSupply={dollarSupply}
        reserves={reserves}
        onSuccess={() => {
          refetch();
          refetchPools();
          refetchBonds();
          refetchReserves();
          refetchProtocol();
        }}
      />

      {backing !== undefined && backing > BigInt(0) && claimValue !== undefined && total > BigInt(0) && (
        <p className="px-1 text-xs leading-relaxed text-haze">
          Sanity check: burning your entire {formatAmount(total, 18, 2)} LSD would pay assets currently valued at{" "}
          {formatAmount(claimValue, 18, 2)} {counterSymbol}, or {formatAmount((claimValue * ONE) / total, 18, 4)}{" "}
          {counterSymbol} per LSD, exactly the backing figure above. If the market pays more than that, selling beats
          redeeming; the floor is for when it does not.
        </p>
      )}
    </div>
  );
}
