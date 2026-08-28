"use client";

import { useState } from "react";
import type { Address } from "viem";
import { implementationAbi } from "@/config/abis";
import type { Reserve } from "@/hooks/useReserves";
import { formatAmount, formatPercent, parseAmount } from "@/lib/format";
import { AmountAction, ApproveGate } from "./actions";
import { Field, Panel, Stat } from "./ui";

export function RedeemPanel({
  root,
  dollar,
  account,
  lsdBalance,
  totalSupply,
  reserves,
  onSuccess,
}: {
  root: Address;
  dollar: Address;
  account: Address;
  lsdBalance: bigint | undefined;
  totalSupply: bigint | undefined;
  reserves: Reserve[];
  onSuccess: () => void;
}) {
  const [input, setInput] = useState("");
  const amount = parseAmount(input, 18);

  // What redeem() would pay, worked out the same way it does: each holding
  // times the share of supply being burned, floored. Integer division here is
  // exact against the contract's, so the preview cannot promise more than the
  // call delivers.
  const preview =
    totalSupply === undefined || totalSupply === BigInt(0)
      ? []
      : reserves.map((r) => (r.balance === undefined ? BigInt(0) : (r.balance * amount) / totalSupply));

  return (
    <Panel title="Reach into the Coffer" hint="Burn LSD for its share of everything held. This is the floor.">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="LSD in wallet" value={formatAmount(lsdBalance, 18, 2)} />
        <Field label="Approve LSD">
          <ApproveGate token={dollar} spender={root} owner={account} label="Approve LSD" />
        </Field>
        <Field label="Redeem LSD">
          <AmountAction
            address={root}
            abi={implementationAbi}
            functionName="redeem"
            decimals={18}
            max={lsdBalance}
            buttonLabel="Redeem"
            value={input}
            onValueChange={setInput}
            onSuccess={onSuccess}
          />
        </Field>
      </div>

      {amount > BigInt(0) && preview.length > 0 && (
        <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <p className="text-xs uppercase tracking-wider text-haze">You would receive</p>
          <div className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
            {reserves.map((r, i) => (
              <p key={r.address} className="text-sm tabular-nums text-chalk">
                {formatAmount(preview[i], r.decimals, 6)} <span className="text-haze">{r.symbol}</span>
              </p>
            ))}
          </div>
          {totalSupply !== undefined && totalSupply > BigInt(0) && (
            <p className="mt-2 text-xs text-haze">
              {formatPercent(amount, totalSupply)}% of the supply, so {formatPercent(amount, totalSupply)}% of each line.
            </p>
          )}
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-haze">
        Redemption pays exactly pro rata, so it cannot break itself: every holding and the supply shrink together and
        everyone left is as backed as they were. It never reads a price, which is why a stale feed cannot close it.
        Worth doing only while LSD trades below its backing.
      </p>
    </Panel>
  );
}
