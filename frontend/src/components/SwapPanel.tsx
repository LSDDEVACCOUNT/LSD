"use client";

import { useState } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { encodeAbiParameters, formatUnits } from "viem";
import type { Address } from "viem";
import { useAddresses } from "@/hooks/useAddresses";
import { useProtocol } from "@/hooks/useProtocol";
import { erc20Abi } from "@/config/abis";
import { CMD_V4_SWAP, POOL_FEE, POOL_TICK_SPACING, UNISWAP, V4_ACTIONS } from "@/config/uniswap";
import { formatAmount, parseAmount } from "@/lib/format";
import { ApproveGate, RawAction } from "./actions";
import { ConnectPrompt, Notice, Panel, Stat, StatRow } from "./ui";

const permit2Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
  },
] as const;

const routerAbi = [
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      { name: "commands", type: "bytes" },
      { name: "inputs", type: "bytes[]" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const MAX_UINT160 = (BigInt(1) << BigInt(160)) - BigInt(1);
const MAX_UINT48 = (BigInt(1) << BigInt(48)) - BigInt(1);

/**
 * Buy or sell LSD against the same pool the oracle reads.
 *
 * Encodes the v4 swap by hand rather than through the Uniswap SDK: Robinhood
 * Chain runs a forked UniversalRouter whose swap struct carries an extra
 * `minHopPriceX36` field, and stock SDK calldata reverts against it.
 */
export function SwapPanel() {
  const { addresses, chainId, configured } = useAddresses();
  const { address: account } = useAccount();
  const { price } = useProtocol();
  const uni = UNISWAP[chainId];

  const [sellingLsd, setSellingLsd] = useState(true);
  const [amount, setAmount] = useState("");
  const [slippagePct, setSlippagePct] = useState("0.5");

  const { data, refetch } = useReadContracts({
    contracts: [
      { address: addresses?.dollar, abi: erc20Abi, functionName: "balanceOf", args: [account!] },
      { address: addresses?.counter, abi: erc20Abi, functionName: "balanceOf", args: [account!] },
      { address: addresses?.counter, abi: erc20Abi, functionName: "decimals" },
      { address: addresses?.counter, abi: erc20Abi, functionName: "symbol" },
    ],
    query: { enabled: configured && !!account, refetchInterval: 12_000 },
  });

  const r = data?.map((x) => x.result);
  const lsdBalance = r?.[0] as bigint | undefined;
  const counterBalance = r?.[1] as bigint | undefined;
  const counterDecimals = (r?.[2] as number | undefined) ?? 6;
  const counterSymbol = (r?.[3] as string | undefined) ?? "USDG";

  const inToken: Address | undefined = sellingLsd ? addresses?.dollar : addresses?.counter;
  const outToken: Address | undefined = sellingLsd ? addresses?.counter : addresses?.dollar;
  const inDecimals = sellingLsd ? 18 : counterDecimals;
  const outDecimals = sellingLsd ? counterDecimals : 18;
  const inSymbol = sellingLsd ? "LSD" : counterSymbol;
  const outSymbol = sellingLsd ? counterSymbol : "LSD";
  const inBalance = sellingLsd ? lsdBalance : counterBalance;

  // Permit2 sits between the token and the router: the token approves Permit2,
  // then Permit2 approves the router. Both legs are one-off.
  const { data: permit2Allowance, refetch: refetchPermit2 } = useReadContract({
    address: uni?.permit2,
    abi: permit2Abi,
    functionName: "allowance",
    args: account && inToken && uni ? [account, inToken, uni.universalRouter] : undefined,
    query: { enabled: !!account && !!inToken && !!uni, refetchInterval: 20_000 },
  });
  const permit2Ready = permit2Allowance !== undefined && (permit2Allowance[0] as bigint) > BigInt(0);


  if (!uni) {
    return (
      <Notice>
        No Uniswap router is configured for this network, so there is nothing to route a trade through. Liquidity can
        still be added directly from the Liquidity page.
      </Notice>
    );
  }

  if (!account) {
    return (
      <Panel title="Trade">
        <ConnectPrompt what="trade LSD" />
      </Panel>
    );
  }

  const amountIn = parseAmount(amount, inDecimals);

  // Estimate from the pool's spot price, less the 0.30% fee. It ignores price
  // impact, so it overstates on large orders - amountOutMinimum is what
  // actually protects you, and slippage below sets it.
  let estimatedOut = BigInt(0);
  if (price !== undefined && price > BigInt(0) && amountIn > BigInt(0)) {
    const scale = BigInt(10) ** BigInt(18);
    const raw = sellingLsd
      ? (amountIn * price * BigInt(10) ** BigInt(counterDecimals)) / (scale * scale)
      : (amountIn * scale * scale) / (price * BigInt(10) ** BigInt(counterDecimals));
    estimatedOut = (raw * BigInt(9970)) / BigInt(10000);
  }
  const slippageBps = BigInt(Math.round(Math.max(0, Number(slippagePct) || 0) * 100));
  const minOut = (estimatedOut * (BigInt(10000) - slippageBps)) / BigInt(10000);

  const dollarIsCurrency0 = addresses.dollar.toLowerCase() < addresses.counter.toLowerCase();
  const [currency0, currency1] = dollarIsCurrency0
    ? [addresses.dollar, addresses.counter]
    : [addresses.counter, addresses.dollar];
  const zeroForOne = sellingLsd ? dollarIsCurrency0 : !dollarIsCurrency0;

  const poolKey = {
    currency0,
    currency1,
    fee: POOL_FEE,
    tickSpacing: POOL_TICK_SPACING,
    hooks: addresses.hook,
  };

  const swapParams = encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          {
            name: "poolKey",
            type: "tuple",
            components: [
              { name: "currency0", type: "address" },
              { name: "currency1", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "tickSpacing", type: "int24" },
              { name: "hooks", type: "address" },
            ],
          },
          { name: "zeroForOne", type: "bool" },
          { name: "amountIn", type: "uint128" },
          { name: "amountOutMinimum", type: "uint128" },
          // Robinhood's fork adds this field. Zero disables the per-hop guard.
          { name: "minHopPriceX36", type: "uint256" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    [{ poolKey, zeroForOne, amountIn, amountOutMinimum: minOut, minHopPriceX36: BigInt(0), hookData: "0x" }],
  );
  const settleAll = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [inToken as Address, amountIn],
  );
  const takeAll = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [outToken as Address, minOut]);
  const routerInput = encodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes[]" }],
    [V4_ACTIONS, [swapParams, settleAll, takeAll]],
  );

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Trade">
        <StatRow>
          <Stat label="LSD in wallet" value={formatAmount(lsdBalance, 18, 2)} />
          <Stat label={`${counterSymbol} in wallet`} value={formatAmount(counterBalance, counterDecimals, 2)} />
          <Stat label="Pool price" value={formatAmount(price, 18, 4)} unit={counterSymbol} />
        </StatRow>

        <div className="mt-6 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSellingLsd(false)}
              className={`btn ${!sellingLsd ? "btn-gilt" : "btn-ghost"}`}
            >
              Buy LSD
            </button>
            <button onClick={() => setSellingLsd(true)} className={`btn ${sellingLsd ? "btn-gilt" : "btn-ghost"}`}>
              Sell LSD
            </button>
          </div>

          <div>
            <p className="eyebrow mb-2">You pay ({inSymbol})</p>
            <div className="relative">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                inputMode="decimal"
                className="field pr-14"
              />
              {inBalance !== undefined && inBalance > BigInt(0) && (
                <button
                  type="button"
                  onClick={() => setAmount(formatUnits(inBalance, inDecimals))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[0.6875rem] uppercase tracking-wider text-haze hover:text-chalk"
                >
                  max
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1">
              <p className="eyebrow mb-2">You receive, about</p>
              <p className="font-mono text-lg text-chalk">
                {formatAmount(estimatedOut, outDecimals, 4)} <span className="text-xs text-haze">{outSymbol}</span>
              </p>
            </div>
            <div className="w-28">
              <p className="eyebrow mb-2">Slippage %</p>
              <input
                value={slippagePct}
                onChange={(e) => setSlippagePct(e.target.value)}
                inputMode="decimal"
                className="field"
              />
            </div>
          </div>

          <p className="text-xs leading-relaxed text-haze">
            The estimate comes from the pool&apos;s spot price less the 0.30% fee and ignores price impact, so a large
            order will land under it. The trade reverts unless it clears{" "}
            <span className="font-mono text-chalk">
              {formatAmount(minOut, outDecimals, 4)} {outSymbol}
            </span>
            .
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="eyebrow mb-2">1. Approve Permit2</p>
              <ApproveGate
                token={inToken as Address}
                spender={uni.permit2}
                owner={account}
                label={`Approve ${inSymbol}`}
              />
            </div>
            <div>
              <p className="eyebrow mb-2">2. Permit2 → router</p>
              {permit2Ready ? (
                <p className="flex h-[38px] items-center text-sm text-lime-300/80">Approved</p>
              ) : (
                <RawAction
                  address={uni.permit2}
                  abi={permit2Abi}
                  functionName="approve"
                  args={[inToken as Address, uni.universalRouter, MAX_UINT160, MAX_UINT48]}
                  buttonLabel="Approve router"
                  variant="ghost"
                  onSuccess={refetchPermit2}
                />
              )}
            </div>
            <div>
              <p className="eyebrow mb-2">3. Swap</p>
              <RawAction
                address={uni.universalRouter}
                abi={routerAbi}
                functionName="execute"
                args={() => [CMD_V4_SWAP, [routerInput], BigInt(Math.floor(Date.now() / 1000) + 300)]}
                buttonLabel={sellingLsd ? "Sell LSD" : "Buy LSD"}
                disabled={amountIn <= BigInt(0) || minOut <= BigInt(0) || !permit2Ready}
                onSuccess={() => {
                  refetch();
                  setAmount("");
                }}
              />
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
