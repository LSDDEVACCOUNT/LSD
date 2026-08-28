"use client";

import { useEffect, useState } from "react";
import { useReadContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import type { Abi, Address, Hash } from "viem";
import { formatUnits, maxUint256 } from "viem";
import { pairedCounterAmount, pairedDollarAmount, parseAmount } from "@/lib/format";
import { useAddresses } from "@/hooks/useAddresses";
import { erc20Abi } from "@/config/abis";
import type { supportedChains } from "@/config/chains";

type ChainId = (typeof supportedChains)[number]["id"];

type WriteParams = {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
};

/** Trims viem's multi-paragraph revert dumps down to the first useful line. */
function shortError(error: Error | null): string | null {
  if (!error) return null;
  const first = error.message.split("\n").find((l) => l.trim().length > 0) ?? error.message;
  return first.length > 160 ? `${first.slice(0, 160)}…` : first;
}

/**
 * Every write in the app goes through here.
 *
 * Deliberately uses the *async* mutation inside a try/catch and pins the
 * target `chainId`: with the fire-and-forget `writeContract` a rejected
 * promise (wrong network, wallet closed, user cancelled) could leave the
 * button spinning forever with nothing shown. Here a failure always lands in
 * `error` and always clears the busy state.
 *
 * If the wallet is on another network we switch first rather than letting
 * wagmi do it implicitly, so the user sees what is being asked of them.
 */
function useTx(onSuccess?: () => void) {
  const { chainId, wrongNetwork, configured } = useAddresses();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [hash, setHash] = useState<Hash | undefined>();
  const [error, setError] = useState<Error | null>(null);
  const [phase, setPhase] = useState<"idle" | "switching" | "signing">("idle");

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
    query: { enabled: !!hash },
  });

  useEffect(() => {
    if (isSuccess) onSuccess?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  async function send(params: WriteParams) {
    setError(null);
    setHash(undefined);

    // The placeholder addresses are real addresses. Without this, a click
    // here would sign a transaction to one of them.
    if (!configured) {
      setError(new Error("No deployment configured yet - there is nothing to send this to."));
      return;
    }

    try {
      if (wrongNetwork) {
        setPhase("switching");
        await switchChainAsync({ chainId: chainId as ChainId });
      }
      setPhase("signing");
      setHash(await writeContractAsync({ ...params, chainId: chainId as ChainId }));
    } catch (e) {
      setError(e as Error);
    } finally {
      setPhase("idle");
    }
  }

  const busy = phase !== "idle" || isConfirming;
  // Every button below is dead until the app knows what it is talking to.
  const unavailable = !configured;
  const label =
    phase === "switching" ? "Switch network…" : phase === "signing" ? "Confirm in wallet…" : isConfirming ? "Pending…" : null;

  return { send, error, isSuccess, busy, label, unavailable };
}

function TxFeedback({ error, isSuccess, label }: { error: Error | null; isSuccess: boolean; label: string | null }) {
  const message = shortError(error);
  if (message) return <p className="mt-1.5 text-xs text-rose-300">{message}</p>;
  if (label) return <p className="mt-1.5 text-xs text-haze">{label}</p>;
  if (isSuccess) return <p className="mt-1.5 text-xs text-lime-300">Confirmed.</p>;
  return null;
}

/**
 * One amount input + button, calling `functionName(amount)` (or a custom arg
 * list via `buildArgs`). Covers every single-uint256 action in the app.
 */
export function AmountAction({
  address,
  abi,
  functionName,
  decimals,
  buttonLabel,
  placeholder = "0.0",
  max,
  buildArgs,
  value: controlledValue,
  onValueChange,
  onSuccess,
}: {
  address: Address;
  abi: Abi;
  functionName: string;
  decimals: number;
  buttonLabel: string;
  placeholder?: string;
  /** Fills the field exactly, so raw on-chain amounts never need copying. */
  max?: bigint;
  buildArgs?: (amount: bigint) => readonly unknown[];
  /** Lift the field out when the caller needs to quote the amount as it is
   *  typed. Left off, the input keeps its own state. */
  value?: string;
  onValueChange?: (next: string) => void;
  onSuccess?: () => void;
}) {
  const [ownValue, setOwnValue] = useState("");
  const value = controlledValue ?? ownValue;
  const setValue = onValueChange ?? setOwnValue;
  const { send, error, isSuccess, busy, label, unavailable } = useTx(onSuccess);

  return (
    <div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            inputMode="decimal"
            className="field pr-14"
          />
          {max !== undefined && max > BigInt(0) && (
            <button
              type="button"
              onClick={() => setValue(formatUnits(max, decimals))}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[0.6875rem] uppercase tracking-wider text-haze hover:text-chalk"
            >
              max
            </button>
          )}
        </div>
        <button
          onClick={() => {
            const amount = parseAmount(value, decimals);
            send({ address, abi, functionName, args: buildArgs ? buildArgs(amount) : [amount] });
          }}
          disabled={busy || unavailable || !value}
          className="btn btn-gilt"
        >
          {busy ? "…" : buttonLabel}
        </button>
      </div>
      <TxFeedback error={error} isSuccess={isSuccess} label={label} />
    </div>
  );
}

/**
 * The pool's `deposit(dollarMax, counterMax)`.
 *
 * Both arguments are maxima: the contract mints the liquidity that fits
 * inside *both* and settles only what that position actually needs, so an
 * oversized side is simply never pulled. That is invisible from two free
 * text fields though, so editing one side fills the other at the pool's
 * current price - the ratio you would actually be charged.
 */
export function DepositToPoolAction({
  address,
  abi,
  dollarDecimals,
  counterDecimals,
  counterSymbol,
  price,
  onSuccess,
}: {
  address: Address;
  abi: Abi;
  dollarDecimals: number;
  counterDecimals: number;
  counterSymbol: string;
  /** Hook `currentPrice()`: counter units per LSD, 18-decimal fixed point. */
  price: bigint | undefined;
  onSuccess?: () => void;
}) {
  const [dollarValue, setDollarValue] = useState("");
  const [counterValue, setCounterValue] = useState("");
  const { send, error, isSuccess, busy, label, unavailable } = useTx(onSuccess);

  const canPair = price !== undefined && price > BigInt(0);

  function onDollarChange(next: string) {
    setDollarValue(next);
    if (!canPair) return;
    if (next.trim() === "") {
      setCounterValue("");
      return;
    }
    setCounterValue(
      formatUnits(pairedCounterAmount(parseAmount(next, dollarDecimals), price, counterDecimals), counterDecimals),
    );
  }

  function onCounterChange(next: string) {
    setCounterValue(next);
    if (!canPair) return;
    if (next.trim() === "") {
      setDollarValue("");
      return;
    }
    setDollarValue(
      formatUnits(pairedDollarAmount(parseAmount(next, counterDecimals), price, counterDecimals), dollarDecimals),
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <input
          value={dollarValue}
          onChange={(e) => onDollarChange(e.target.value)}
          placeholder="LSD"
          inputMode="decimal"
          className="field w-24 flex-1"
        />
        <input
          value={counterValue}
          onChange={(e) => onCounterChange(e.target.value)}
          placeholder={counterSymbol}
          inputMode="decimal"
          className="field w-24 flex-1"
        />
        <button
          onClick={() =>
            send({
              address,
              abi,
              functionName: "deposit",
              args: [parseAmount(dollarValue, dollarDecimals), parseAmount(counterValue, counterDecimals)],
            })
          }
          disabled={busy || unavailable || !dollarValue || !counterValue}
          className="btn btn-gilt"
        >
          {busy ? "…" : "Deposit"}
        </button>
      </div>
      {canPair && (
        <p className="mt-1.5 text-xs text-haze">
          Paired at 1 LSD = {formatUnits(pairedCounterAmount(BigInt(10) ** BigInt(18), price, counterDecimals), counterDecimals)}{" "}
          {counterSymbol}, the current pool price.
        </p>
      )}
      <TxFeedback error={error} isSuccess={isSuccess} label={label} />
    </div>
  );
}

/** Two-argument redeem, for `redeemCoupons(epoch, amount)`. */
export function RedeemCouponsAction({
  address,
  abi,
  epoch,
  decimals,
  onSuccess,
}: {
  address: Address;
  abi: Abi;
  epoch: bigint;
  decimals: number;
  onSuccess?: () => void;
}) {
  const [value, setValue] = useState("");
  const { send, error, isSuccess, busy, label, unavailable } = useTx(onSuccess);

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Amount"
          inputMode="decimal"
          className="field"
        />
        <button
          onClick={() => send({ address, abi, functionName: "redeemCoupons", args: [epoch, parseAmount(value, decimals)] })}
          disabled={busy || unavailable || !value}
          className="btn btn-gilt"
        >
          {busy ? "…" : "Redeem"}
        </button>
      </div>
      <TxFeedback error={error} isSuccess={isSuccess} label={label} />
    </div>
  );
}

/** No-argument action, e.g. `advance()`. */
export function SimpleAction({
  address,
  abi,
  functionName,
  buttonLabel,
  variant = "gilt",
  onSuccess,
}: {
  address: Address;
  abi: Abi;
  functionName: string;
  buttonLabel: string;
  variant?: "gilt" | "ghost";
  onSuccess?: () => void;
}) {
  const { send, error, isSuccess, busy, label, unavailable } = useTx(onSuccess);

  return (
    <div>
      <button
        onClick={() => send({ address, abi, functionName, args: [] })}
        disabled={busy || unavailable}
        className={`btn w-full ${variant === "gilt" ? "btn-gilt" : "btn-ghost"}`}
      >
        {busy ? "…" : buttonLabel}
      </button>
      <TxFeedback error={error} isSuccess={isSuccess} label={label} />
    </div>
  );
}

/** Unlimited `approve(spender, max)` in one click. */
export function ApproveMaxButton({
  token,
  spender,
  label: buttonLabel,
  onSuccess,
}: {
  token: Address;
  spender: Address;
  label: string;
  onSuccess?: () => void;
}) {
  const approveAbi: Abi = [
    {
      type: "function",
      name: "approve",
      stateMutability: "nonpayable",
      inputs: [
        { name: "spender", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [{ type: "bool" }],
    },
  ];

  const { send, error, isSuccess, busy, label, unavailable } = useTx(onSuccess);

  return (
    <div>
      <button
        onClick={() => send({ address: token, abi: approveAbi, functionName: "approve", args: [spender, maxUint256] })}
        disabled={busy || unavailable}
        className="btn btn-ghost w-full"
      >
        {busy ? "…" : buttonLabel}
      </button>
      <TxFeedback error={error} isSuccess={isSuccess} label={label} />
    </div>
  );
}

/**
 * Shows the approve button only while an approval is actually missing.
 *
 * `approve(spender, max)` is a one-off: once granted it stands until revoked,
 * so a permanently visible button reads like something you must click every
 * time. Reads the live allowance instead and steps aside once it is set.
 */
export function ApproveGate({
  token,
  spender,
  owner,
  label,
  children,
}: {
  token: Address;
  spender: Address;
  owner: Address | undefined;
  label: string;
  children?: React.ReactNode;
}) {
  const { data: allowance, refetch } = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: owner ? [owner, spender] : undefined,
    query: { enabled: !!owner, refetchInterval: 20_000 },
  });

  // An unlimited approval is 2^256-1; anything of that magnitude is one of
  // ours and will not run out. A smaller allowance from elsewhere still
  // counts as "needs approving" here rather than silently capping a deposit.
  const approved = allowance !== undefined && allowance > BigInt(10) ** BigInt(36);

  if (approved) {
    return (
      children ?? (
        <p className="flex h-[38px] items-center text-sm text-lime-300/80">Approved</p>
      )
    );
  }
  return <ApproveMaxButton token={token} spender={spender} label={label} onSuccess={refetch} />;
}

/**
 * A write with caller-supplied args and no input of its own. For calls whose
 * arguments are assembled elsewhere, like the router's encoded swap.
 */
export function RawAction({
  address,
  abi,
  functionName,
  args,
  buttonLabel,
  variant = "gilt",
  disabled = false,
  onSuccess,
}: {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  /** A thunk when an argument must be fresh at click time, such as a deadline. */
  args: readonly unknown[] | (() => readonly unknown[]);
  buttonLabel: string;
  variant?: "gilt" | "ghost";
  disabled?: boolean;
  onSuccess?: () => void;
}) {
  const { send, error, isSuccess, busy, label, unavailable } = useTx(onSuccess);

  return (
    <div>
      <button
        onClick={() => send({ address, abi: abi as Abi, functionName, args: typeof args === "function" ? args() : args })}
        disabled={busy || unavailable || disabled}
        className={`btn w-full ${variant === "gilt" ? "btn-gilt" : "btn-ghost"}`}
      >
        {busy ? "…" : buttonLabel}
      </button>
      <TxFeedback error={error} isSuccess={isSuccess} label={label} />
    </div>
  );
}
