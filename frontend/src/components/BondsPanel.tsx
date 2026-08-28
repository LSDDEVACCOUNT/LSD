"use client";

import { useState } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { useAddresses } from "@/hooks/useAddresses";
import { useProtocol } from "@/hooks/useProtocol";
import { useReserves, type Reserve } from "@/hooks/useReserves";
import { useBondHoldings } from "@/hooks/useBondHoldings";
import { RedeemPanel } from "./RedeemPanel";
import { erc20Abi, implementationAbi, oracleHookAbi } from "@/config/abis";
import { bondVestingEpochsAt, constantsFor } from "@/config/protocol";
import { formatAmount, formatPercent, parseAmount } from "@/lib/format";
import { AmountAction, ApproveGate, RawAction } from "./actions";
import { ConnectPrompt, Field, Notice, Panel, Stat, StatRow } from "./ui";

export function BondsPanel() {
  const { addresses, configured, chainId } = useAddresses();
  const { address: account } = useAccount();
  const { epoch, dollarSupply, refetch: refetchProtocol } = useProtocol();
  const constants = constantsFor(chainId);
  const { bootstrappingPeriod } = constants;
  const bootstrapping = epoch !== undefined && epoch <= BigInt(bootstrappingPeriod);
  // Genesis epochs are shorter, so a genesis bond vests over more of them
  // for the same day's wait. The contract decides; this label follows it.
  const bondVestingEpochs =
    epoch === undefined ? constants.bondVestingEpochs : bondVestingEpochsAt(epoch, constants);
  const { reserves, refetch: refetchReserves } = useReserves();

  const [asset, setAsset] = useState<Address | undefined>();
  const [bondInput, setBondInput] = useState("");

  // Derived rather than synced: with no pick, or a pick governance has since
  // delisted, this falls back to reserve zero (the counter token) on its own.
  const bondable = reserves.filter((r) => r.bondable);
  const selected = bondable.find((r) => r.address === asset) ?? bondable[0];

  const { data, refetch } = useReadContracts({
    contracts: [
      { address: addresses?.root, abi: implementationAbi, functionName: "treasuryValue" },
      { address: addresses?.root, abi: implementationAbi, functionName: "backingPerDollar" },
      { address: addresses?.root, abi: implementationAbi, functionName: "effectiveBondPrice" },
      { address: addresses?.root, abi: implementationAbi, functionName: "bondDiscount" },
      { address: addresses?.root, abi: implementationAbi, functionName: "bondCapacity" },
      { address: addresses?.root, abi: implementationAbi, functionName: "totalBonds" },
      { address: addresses?.root, abi: implementationAbi, functionName: "bondsPaused" },
      { address: addresses?.counter, abi: erc20Abi, functionName: "symbol" },
      { address: addresses?.dollar, abi: erc20Abi, functionName: "balanceOf", args: [account!] },
    ],
    query: { enabled: configured, refetchInterval: 12_000 },
  });

  const { holdings, refetch: refetchBonds } = useBondHoldings();

  const { data: walletBalance } = useReadContract({
    address: selected?.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account!],
    query: { enabled: configured && !!account && !!selected, refetchInterval: 15_000 },
  });

  const bondAmount = selected ? parseAmount(bondInput, selected.decimals) : BigInt(0);
  const { data: quotedPayout } = useReadContract({
    address: addresses?.root,
    abi: implementationAbi,
    functionName: "bondPayoutFor",
    args: [selected?.address as Address, bondAmount],
    query: { enabled: configured && !!selected && bondAmount > BigInt(0) },
  });


  const r = data?.map((x) => x.result);
  const treasuryValue = r?.[0] as readonly [bigint, boolean] | undefined;
  const treasury = treasuryValue?.[0];
  const treasuryComplete = treasuryValue?.[1] ?? true;
  const backing = r?.[1] as bigint | undefined;
  const bondPrice = r?.[2] as bigint | undefined;
  const discount = r?.[3] as bigint | undefined;
  const capacity = r?.[4] as bigint | undefined;
  const outstanding = r?.[5] as bigint | undefined;
  const paused = (r?.[6] as boolean | undefined) ?? false;
  const counterSymbol = (r?.[7] as string | undefined) ?? "USDG";
  const lsdBalance = r?.[8] as bigint | undefined;

  // The contract refuses a pledge whose payout exceeds what is left of the
  // epoch's issuance cap, so Max is not "everything in the wallet": it is
  // the wallet clipped to the amount whose payout just fits the cap. This
  // inverts the payout math (payout = amount·10^(18-dec)·assetPrice /
  // bondPrice), rounding down so the resulting quote never lands over.
  const capAsAmount =
    capacity !== undefined &&
    bondPrice !== undefined &&
    bondPrice > BigInt(0) &&
    selected !== undefined &&
    selected.priced &&
    selected.price !== undefined &&
    selected.price > BigInt(0) &&
    selected.decimals <= 18
      ? (capacity * bondPrice) / (selected.price * BigInt(10) ** BigInt(18 - selected.decimals))
      : undefined;
  const walletMax = walletBalance as bigint | undefined;
  const maxBondable =
    walletMax === undefined
      ? capAsAmount
      : capAsAmount === undefined
        ? walletMax
        : walletMax < capAsAmount
          ? walletMax
          : capAsAmount;

  const refetchAll = () => {
    refetch();
    refetchBonds();
    refetchReserves();
    refetchProtocol();
  };


  const bondsOpen = bondPrice !== undefined && bondPrice > BigInt(0) && treasuryComplete;

  // What the discount is worth as a rate. A pledge pays (1 - d) now for a
  // full LSD after the ~1-day vest, a per-cycle return of d/(1-d); repeated
  // daily for a week that compounds to (1+r)^7 - 1. Waived-discount
  // bootstrap epochs show nothing.
  const discountFrac = discount !== undefined ? Number(discount) / 1e18 : undefined;
  const impliedWeekly =
    !bootstrapping && discountFrac !== undefined && discountFrac > 0 && discountFrac < 1
      ? Math.pow(1 + discountFrac / (1 - discountFrac), 7) - 1
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Backing">
        <StatRow>
          <Stat label="Treasury" value={formatAmount(treasury, 18, 2)} unit={counterSymbol} />
          <Stat label="Backing per LSD" value={formatAmount(backing, 18, 4)} unit={counterSymbol} accent />
          <Stat
            label="Bond price"
            value={bondsOpen ? formatAmount(bondPrice, 18, 4) : "closed"}
            unit={bondsOpen ? counterSymbol : undefined}
          />
          <Stat
            label="Discount"
            value={bootstrapping ? "waived" : discount === undefined ? "—" : `${formatAmount(discount * BigInt(100), 18, 2)}%`}
          />
          <Stat
            label="Predicted weekly"
            value={impliedWeekly === undefined ? "—" : `${(impliedWeekly * 100).toFixed(1)}%`}
          />
          <Stat label="Room this epoch" value={formatAmount(capacity, 18, 2)} unit="LSD" />
          <Stat label="Unclaimed bonds" value={formatAmount(outstanding, 18, 2)} unit="LSD" />
        </StatRow>
        <p className="mt-4 text-xs leading-relaxed text-haze">
          Bonding hands the protocol an asset and owes you LSD {bondVestingEpochs} epochs later
          {bootstrapping
            ? ". While the protocol bootstraps the price is a flat 5 USDG with no discount; overpaying is the cost of being in before the multiplication"
            : " at a discount"}. The asset
          stays, which is what puts a floor under the price: anyone can burn LSD and take its share of everything held,
          so LSD cannot trade far under its backing for long. Every trade in the pools adds to it too, since a 0.05% fee on the USDG pool and 1% on the stock pools go
          straight to the treasury.
        </p>
      </Panel>

      <ReserveTable reserves={reserves} treasury={treasury} counterSymbol={counterSymbol} />

      <SweepPanel
        hook={addresses.hook}
        dollar={addresses.dollar}
        counter={addresses.counter}
        counterSymbol={counterSymbol}
        onSuccess={refetchAll}
      />

      {paused && (
        <Notice tone="warn">
          Pledges are paused. The treasurer pulled the emergency brake, which stops new bonds and nothing
          else: existing claims still vest and pay, and redemption stays open. Only a governance vote
          reopens the window.
        </Notice>
      )}

      {!treasuryComplete && (
        <Notice tone="warn">
          One of the reserves cannot be priced right now: its Chainlink feed is stale or not answering, or feed and
          pool disagree by more than 10%. Bonding is closed until the sources agree again, because a treasury that
          reads wrong would let a bond through that lowers the floor. Redemption is unaffected: it pays a share of
          every asset held and never consults a price.
        </Notice>
      )}

      {!bondsOpen && treasuryComplete && (
        <Notice>
          Bonds are closed because the pool is too thin for the oracle to vouch for a price. That is the one thing
          that closes them; no discount setting and no market condition can. Redemption stays open either way.
        </Notice>
      )}

      {!account ? (
        <Panel title="Pledge">
          <ConnectPrompt what="bond" />
        </Panel>
      ) : (
        <>
          <Panel title="Pledge" hint={`Pay now, collect LSD in ${bondVestingEpochs} epochs.`}>
            {bondable.length > 1 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {bondable.map((res) => (
                  <button
                    key={res.address}
                    type="button"
                    onClick={() => {
                      setAsset(res.address);
                      setBondInput("");
                    }}
                    className={
                      "rounded-lg border px-3 py-1.5 text-sm transition " +
                      (selected?.address === res.address
                        ? "border-white/25 bg-white/[0.07] text-chalk"
                        : "border-white/[0.07] text-haze hover:text-chalk")
                    }
                  >
                    {res.symbol}
                  </button>
                ))}
              </div>
            )}

            {!selected && (
              <p className="mb-4 text-sm text-haze">
                No asset can be bonded yet; the treasury has nothing listed to take.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat
                label={`${selected?.symbol ?? "—"} in wallet`}
                value={formatAmount(walletBalance as bigint | undefined, selected?.decimals ?? 18, 2)}
              />
              <Field label={`Approve ${selected?.symbol ?? ""}`}>
                {selected && (
                  <ApproveGate
                    token={selected.address}
                    spender={addresses.root}
                    owner={account}
                    label={`Approve ${selected.symbol}`}
                  />
                )}
              </Field>
              <Field label={`Bond ${selected?.symbol ?? ""}`}>
                {selected && (
                  <AmountAction
                    address={addresses.root}
                    abi={implementationAbi}
                    functionName="purchaseBond"
                    decimals={selected.decimals}
                    max={maxBondable}
                    buttonLabel="Bond"
                    value={bondInput}
                    onValueChange={setBondInput}
                    buildArgs={(amount) => [selected.address, amount]}
                    onSuccess={refetchAll}
                  />
                )}
              </Field>
            </div>

            {bondAmount > BigInt(0) && (
              <p className="mt-3 text-sm text-chalk">
                Claimable at epoch {epoch === undefined ? "—" : String(epoch + BigInt(bondVestingEpochs))}:{" "}
                <span className="gilt-text">{formatAmount(quotedPayout as bigint | undefined, 18, 2)} LSD</span>
              </p>
            )}

            <p className="mt-4 text-xs leading-relaxed text-haze">
              Issuance is capped each epoch, and the price can never dip below the current backing: whenever the
              discount would take it there, it clamps to backing instead. There is no price at which a bond can lower
              the floor.
            </p>
          </Panel>

          <Panel title="Your pledges">
            {holdings.length === 0 ? (
              <p className="text-sm text-haze">No bonds.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {holdings.map((h) => {
                  const ready = h.ready;
                  return (
                    <div
                      key={String(h.epoch)}
                      className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"
                    >
                      <div className="flex gap-8">
                        <Stat label="Claimable at epoch" value={String(h.epoch)} />
                        <Stat label="Amount" value={formatAmount(h.amount, 18, 2)} unit="LSD" accent />
                        <Stat label="Status" value={ready ? "ready" : "vesting"} />
                      </div>
                      <div className="w-full sm:w-48">
                        <RawAction
                          address={addresses.root}
                          abi={implementationAbi}
                          functionName="claimBond"
                          args={[h.epoch]}
                          buttonLabel="Claim"
                          disabled={!ready}
                          onSuccess={refetchAll}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <RedeemPanel
            root={addresses.root}
            dollar={addresses.dollar}
            account={account}
            lsdBalance={lsdBalance}
            totalSupply={dollarSupply}
            reserves={reserves}
            onSuccess={refetchAll}
          />
        </>
      )}
    </div>
  );
}

/**
 * The fee the hooks charge on every swap sits in the hook until someone
 * moves it. Anyone can, and there is nowhere else it can go: the counter side
 * goes to the DAO and becomes backing, the LSD side is burned.
 */
function SweepPanel({
  hook,
  dollar,
  counter,
  counterSymbol,
  onSuccess,
}: {
  hook: Address;
  dollar: Address;
  counter: Address;
  counterSymbol: string;
  onSuccess: () => void;
}) {
  const { data } = useReadContracts({
    contracts: [
      { address: dollar, abi: erc20Abi, functionName: "balanceOf", args: [hook] },
      { address: counter, abi: erc20Abi, functionName: "balanceOf", args: [hook] },
      { address: counter, abi: erc20Abi, functionName: "decimals" },
    ],
    query: { refetchInterval: 20_000 },
  });

  const pendingDollar = data?.[0]?.result as bigint | undefined;
  const pendingCounter = data?.[1]?.result as bigint | undefined;
  const counterDecimals = (data?.[2]?.result as number | undefined) ?? 6;
  const anything = (pendingDollar ?? BigInt(0)) > BigInt(0) || (pendingCounter ?? BigInt(0)) > BigInt(0);

  return (
    <Panel title="Swap fees" hint="0.05% of USDG trades, 1% of stock trades, waiting to be banked.">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex gap-8">
          <Stat label="Collected" value={formatAmount(pendingCounter, counterDecimals, 4)} unit={counterSymbol} />
          <Stat label="To burn" value={formatAmount(pendingDollar, 18, 4)} unit="LSD" />
        </div>
        <div className="w-full sm:w-48">
          <RawAction
            address={hook}
            abi={oracleHookAbi}
            functionName="sweep"
            args={[]}
            buttonLabel="Sweep"
            disabled={!anything}
            onSuccess={onSuccess}
          />
        </div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-haze">
        Anyone can do this and it can only go one way: the {counterSymbol} joins the treasury, where redemption pays it
        out, and the LSD is burned, which lifts backing per LSD from the other side. It is the only part of the backing
        that grows without anyone choosing to bond.
      </p>
    </Panel>
  );
}

function ReserveTable({
  reserves,
  treasury,
  counterSymbol,
}: {
  reserves: Reserve[];
  treasury: bigint | undefined;
  counterSymbol: string;
}) {
  return (
    <Panel title="What the Coffer holds" hint="Redemption pays a share of every line.">
      {reserves.length === 0 && (
        <p className="mb-4 text-sm text-haze">Nothing listed yet.</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-haze">
              <th className="pb-2 font-medium">Asset</th>
              <th className="pb-2 text-right font-medium">Held</th>
              <th className="pb-2 text-right font-medium">Price</th>
              <th className="pb-2 text-right font-medium">Value</th>
              <th className="pb-2 text-right font-medium">Share</th>
              <th className="pb-2 text-right font-medium">Bonds</th>
            </tr>
          </thead>
          <tbody>
            {reserves.map((r) => (
              <tr key={r.address} className="border-t border-white/[0.06]">
                <td className="py-2.5 text-chalk">{r.symbol}</td>
                <td className="py-2.5 text-right tabular-nums">{formatAmount(r.balance, r.decimals, 4)}</td>
                <td className="py-2.5 text-right tabular-nums">
                  {r.priced ? formatAmount(r.price, 18, 2) : <span className="text-amber-300">no feed</span>}
                </td>
                <td className="py-2.5 text-right tabular-nums">{r.priced ? formatAmount(r.value, 18, 2) : "—"}</td>
                <td className="py-2.5 text-right tabular-nums">
                  {r.priced ? `${formatPercent(r.value, treasury)}%` : "—"}
                </td>
                <td className="py-2.5 text-right text-haze">{r.bondable ? "open" : "closed"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-haze">
        Value and price are in {counterSymbol}. Stocks are priced by the Chainlink feed Robinhood publishes for each
        one; the {counterSymbol} line needs no feed, because everything is measured against it. Governance decides what
        gets listed. It is the one change that could be used to drain the protocol, so it is a vote rather than a
        setting.
      </p>
    </Panel>
  );
}
