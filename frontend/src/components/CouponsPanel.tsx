"use client";

import { useState } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { useAddresses } from "@/hooks/useAddresses";
import { useProtocol } from "@/hooks/useProtocol";
import { erc20Abi, implementationAbi } from "@/config/abis";
import { formatAmount } from "@/lib/format";
import { AmountAction, ApproveGate, RedeemCouponsAction } from "./actions";
import { ConnectPrompt, Field, Notice, Panel, Stat, StatRow } from "./ui";
import { constantsFor } from "@/config/protocol";

export function CouponsPanel() {
  const { addresses, configured, chainId } = useAddresses();
  const { address: account } = useAccount();
  const { epoch, totalDebt, totalCoupons, totalRedeemable, dollarSupply, refetch: refetchProtocol } = useProtocol();
  const [acknowledged, setAcknowledged] = useState(false);
  const { couponExpiration } = constantsFor(chainId);

  // Epochs that could still hold a live coupon balance for this account.
  const epochsToScan: bigint[] = [];
  if (epoch !== undefined) {
    const oldest = epoch > BigInt(couponExpiration) ? epoch - BigInt(couponExpiration) : BigInt(0);
    for (let e = epoch; e >= oldest; e--) {
      epochsToScan.push(e);
      if (e === BigInt(0)) break;
    }
  }

  const { data: couponData, refetch: refetchCoupons } = useReadContracts({
    contracts: epochsToScan.map((e) => ({
      address: addresses?.root,
      abi: implementationAbi,
      functionName: "balanceOfCoupons" as const,
      args: [account!, e] as const,
    })),
    // 360 slots per scan: coupons move four times a day, so once a minute is generous.
    query: { enabled: configured && !!account && epochsToScan.length > 0, refetchInterval: 60_000 },
  });

  const { data: walletData, refetch: refetchWallet } = useReadContracts({
    contracts: [{ address: addresses?.dollar, abi: erc20Abi, functionName: "balanceOf", args: [account!] }],
    query: { enabled: configured && !!account, refetchInterval: 12_000 },
  });

  const refetchAll = () => {
    refetchProtocol();
    refetchCoupons();
    refetchWallet();
  };


  const holdings = epochsToScan
    .map((e, i) => ({ epoch: e, amount: couponData?.[i]?.result as bigint | undefined }))
    .filter((h) => h.amount !== undefined && h.amount > BigInt(0));

  const debtRatio =
    totalDebt !== undefined && dollarSupply !== undefined && dollarSupply > BigInt(0)
      ? (Number(totalDebt) / Number(dollarSupply)) * 100
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <Panel title="The ledger">
        <StatRow>
          <Stat label="Total debt" value={formatAmount(totalDebt, 18, 2)} unit="LSD" accent />
          <Stat label="Debt ratio" value={debtRatio !== undefined ? debtRatio.toFixed(2) : "—"} unit="%" />
          <Stat label="Coupons outstanding" value={formatAmount(totalCoupons, 18, 2)} />
          <Stat label="Redeemable" value={formatAmount(totalRedeemable, 18, 2)} unit="LSD" />
        </StatRow>
      </Panel>

      <Notice tone="warn">
        <p className="font-medium text-amber-100">Coupons can go to zero.</p>
        <p className="mt-1.5 leading-relaxed">
          Buying burns your LSD on the spot. Coupons only become redeemable again once the supply expands, and then
          only until that epoch&apos;s tranche runs out: first come, first served. Nothing guarantees you get there in
          time, and anything still unredeemed after {couponExpiration} epochs is gone.
        </p>
      </Notice>

      {!account ? (
        <Panel title="Purchase">
          <ConnectPrompt what="purchase coupons" />
        </Panel>
      ) : (
        <>
          <Panel title="Purchase" hint="Only works while the protocol carries debt, which happens during a contraction.">
            {!acknowledged ? (
              <button className="btn btn-ghost" onClick={() => setAcknowledged(true)}>
                I understand the risk
              </button>
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                <Stat label="LSD in wallet" value={formatAmount(walletData?.[0]?.result as bigint | undefined, 18, 2)} />
                <Field label="Approve LSD">
                  <ApproveGate
                    token={addresses.dollar}
                    spender={addresses.root}
                    owner={account}
                    label="Approve LSD"
                  />
                </Field>
                <Field label="Buy coupons">
                  <AmountAction
                    address={addresses.root}
                    abi={implementationAbi}
                    functionName="purchaseCoupons"
                    decimals={18}
                    max={walletData?.[0]?.result as bigint | undefined}
                    buttonLabel="Purchase"
                    onSuccess={refetchAll}
                  />
                </Field>
              </div>
            )}
          </Panel>

          <Panel title="Your coupons" hint="Held per epoch. Each batch expires on its own clock.">
            {holdings.length === 0 ? (
              <p className="text-sm text-haze">No coupons.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {holdings.map((h) => (
                  <div
                    key={String(h.epoch)}
                    className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"
                  >
                    <div className="flex gap-8">
                      <Stat label="Purchased in epoch" value={String(h.epoch)} />
                      <Stat label="Amount" value={formatAmount(h.amount, 18, 2)} accent />
                    </div>
                    <div className="w-full sm:w-64">
                      <RedeemCouponsAction
                        address={addresses.root}
                        abi={implementationAbi}
                        epoch={h.epoch}
                        decimals={18}
                        onSuccess={refetchAll}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
