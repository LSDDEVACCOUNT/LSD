"use client";

import { useState } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { useAddresses } from "@/hooks/useAddresses";
import { usePools, type LpPool } from "@/hooks/usePools";
import { erc20Abi, poolAbi } from "@/config/abis";
import { formatAmount, formatPercent } from "@/lib/format";
import { AmountAction, ApproveGate, DepositToPoolAction } from "./actions";
import { ConnectPrompt, Field, Notice, Panel, Stat, StatRow } from "./ui";

export function PoolPanel() {
  const { address: account } = useAccount();
  const { pools, totalWeight, refetch: refetchPools } = usePools();

  const [selected, setSelected] = useState<string | undefined>();
  const pool = pools.find((p) => p.address === selected) ?? pools[0];


  return (
    <div className="flex flex-col gap-6">
      <Schedule pools={pools} totalWeight={totalWeight} />

      {pools.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {pools.map((p) => (
            <button
              key={p.address}
              type="button"
              onClick={() => setSelected(p.address)}
              className={
                "rounded-lg border px-3 py-1.5 text-sm transition " +
                (pool?.address === p.address
                  ? "border-white/25 bg-white/[0.07] text-chalk"
                  : "border-white/[0.07] text-haze hover:text-chalk")
              }
            >
              LSD / {p.counterSymbol}
            </button>
          ))}
        </div>
      )}

      {!account ? (
        <Panel title="Quiver">
          <ConnectPrompt what="provide liquidity" />
        </Panel>
      ) : pool ? (
        <PoolPosition key={pool.address} pool={pool} account={account} onSuccess={refetchPools} />
      ) : (
        <Notice>No pools on the emission schedule yet.</Notice>
      )}
    </div>
  );
}

/**
 * What each pair earns. Weights are relative, so the interesting number is
 * the share, not the weight itself.
 */
function Schedule({ pools, totalWeight }: { pools: LpPool[]; totalWeight: bigint }) {
  return (
    <Panel title="Emission schedule" hint="A quarter of every expansion, split like this.">
      {pools.length === 0 && (
        <p className="mb-4 text-sm text-haze">No pairs on the schedule yet.</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-haze">
              <th className="pb-2 font-medium">Pair</th>
              <th className="pb-2 text-right font-medium">Share of LP rewards</th>
              <th className="pb-2 text-right font-medium">LSD price</th>
              <th className="pb-2 text-right font-medium">Bonded liquidity</th>
            </tr>
          </thead>
          <tbody>
            {pools.map((p) => (
              <tr key={p.address} className="border-t border-white/[0.06]">
                <td className="py-2.5 text-chalk">LSD / {p.counterSymbol}</td>
                <td className="py-2.5 text-right tabular-nums">
                  {p.weight === BigInt(0) ? <span className="text-haze">paused</span> : `${formatPercent(p.weight, totalWeight)}%`}
                </td>
                <td className="py-2.5 text-right tabular-nums">
                  {formatAmount(p.price, 18, 6)} <span className="text-haze">{p.counterSymbol}</span>
                </td>
                <td className="py-2.5 text-right tabular-nums">
                  {formatPercent(p.totalBonded, (p.totalStaged ?? BigInt(0)) + (p.totalBonded ?? BigInt(0)))}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-haze">
        The LSD / {pools[0]?.counterSymbol ?? "stablecoin"} pair carries the largest share on purpose: the protocol reads
        its price from that pool, and if its liquidity thins out the oracle stops vouching for a price and the protocol
        stops regulating at all. The stock pairs are extra places to earn, not a replacement for it. Governance sets
        the weights.
      </p>
    </Panel>
  );
}

function PoolPosition({ pool, account, onSuccess }: { pool: LpPool; account: `0x${string}`; onSuccess: () => void }) {
  const { addresses } = useAddresses();

  const { data, refetch } = useReadContracts({
    contracts: [
      { address: addresses?.dollar, abi: erc20Abi, functionName: "balanceOf", args: [account] },
      { address: pool.counter, abi: erc20Abi, functionName: "balanceOf", args: [account] },
      { address: pool.address, abi: poolAbi, functionName: "accounts", args: [account] },
      { address: pool.address, abi: poolAbi, functionName: "totalStaged" },
      { address: pool.address, abi: poolAbi, functionName: "totalBonded" },
    ],
    query: { refetchInterval: 12_000 },
  });

  const refetchAll = () => {
    refetch();
    onSuccess();
  };

  const r = data?.map((x) => x.result);
  const [staged, claimable, bonded] = (r?.[2] as readonly bigint[] | undefined) ?? [];
  const poolStaged = r?.[3] as bigint | undefined;
  const poolBonded = r?.[4] as bigint | undefined;

  const poolTotal = poolStaged !== undefined && poolBonded !== undefined ? poolStaged + poolBonded : undefined;
  const mine = staged !== undefined && bonded !== undefined ? staged + bonded : undefined;
  const symbol = pool.counterSymbol;

  return (
    <div className="flex flex-col gap-6">
      <Panel title={`Your position: LSD / ${symbol}`}>
        <StatRow>
          <Stat label="LSD in wallet" value={formatAmount(r?.[0] as bigint | undefined, 18, 2)} />
          <Stat label={`${symbol} in wallet`} value={formatAmount(r?.[1] as bigint | undefined, pool.counterDecimals, 2)} />
          <Stat label="Share of pool" value={formatPercent(mine, poolTotal)} unit="%" accent />
          <Stat label="Of that, bonded" value={formatPercent(bonded, mine)} unit="%" />
          <Stat label="Claimable" value={formatAmount(claimable, 18, 4)} unit="LSD" />
        </StatRow>
        <p className="mt-4 text-xs leading-relaxed text-haze">
          Liquidity you add sits <span className="text-chalk">staged</span> first: it is in the pool but idle, and you
          can pull it back out whenever you want. <span className="text-chalk">Filling the quiver</span> (bonding) locks it in to earn a
          share of each expansion, and takes twelve epochs (three days) to undo. Rewards are paid in LSD whichever pair you provide to.
        </p>
      </Panel>

      <Panel title="Provide">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Approve LSD">
            <ApproveGate token={addresses!.dollar} spender={pool.address} owner={account} label="Approve LSD" />
          </Field>
          <Field label={`Approve ${symbol}`}>
            <ApproveGate token={pool.counter} spender={pool.address} owner={account} label={`Approve ${symbol}`} />
          </Field>
          <Field label={`Deposit LSD + ${symbol}`}>
            <DepositToPoolAction
              address={pool.address}
              abi={poolAbi}
              dollarDecimals={18}
              counterDecimals={pool.counterDecimals}
              counterSymbol={symbol}
              price={pool.price}
              onSuccess={refetchAll}
            />
          </Field>
        </div>
      </Panel>

      <Panel title="Fill & claim" hint="Hit max to fill in the exact amount.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Bond staged">
            <AmountAction
              address={pool.address}
              abi={poolAbi}
              functionName="bond"
              decimals={0}
              placeholder="0"
              max={staged}
              buttonLabel="Bond"
              onSuccess={refetchAll}
            />
          </Field>
          <Field label="Unbond">
            <AmountAction
              address={pool.address}
              abi={poolAbi}
              functionName="unbond"
              decimals={0}
              placeholder="0"
              max={bonded}
              buttonLabel="Unbond"
              onSuccess={refetchAll}
            />
          </Field>
          <Field label="Withdraw staged">
            <AmountAction
              address={pool.address}
              abi={poolAbi}
              functionName="withdraw"
              decimals={0}
              placeholder="0"
              max={staged}
              buttonLabel="Withdraw"
              onSuccess={refetchAll}
            />
          </Field>
          <Field label="Claim rewards">
            <AmountAction
              address={pool.address}
              abi={poolAbi}
              functionName="claim"
              decimals={18}
              max={claimable}
              buttonLabel="Claim"
              onSuccess={refetchAll}
            />
          </Field>
        </div>
      </Panel>
    </div>
  );
}
