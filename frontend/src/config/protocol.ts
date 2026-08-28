import { robinhoodMainnet } from "./chains";

/**
 * Compile-time constants from `protocol/contracts/Constants.sol` that the DAO
 * does not expose through a getter.
 *
 * Only the epoch countdown and the coupon scan need them.
 *
 * Nothing here decides whether an action is allowed - that always comes from
 * the chain (`epochTime() > epoch()`), so a stale value only makes the
 * countdown drift, never lets a call through that the contract would reject.
 */
type ProtocolConstants = {
  bootstrappingPeriod: number;
  bootstrappingSpeedupFactor: number;
  /** Coupons expire this many epochs after purchase. */
  couponExpiration: number;
  /** Epochs a bond vests before it can be claimed. */
  bondVestingEpochs: number;
};

const CONSTANTS: Record<number, ProtocolConstants> = {
  [robinhoodMainnet.id]: {
    bootstrappingPeriod: 45,
    bootstrappingSpeedupFactor: 3,
    couponExpiration: 360,
    bondVestingEpochs: 4,
  },
};

export function constantsFor(chainId: number): ProtocolConstants {
  return CONSTANTS[chainId] ?? CONSTANTS[robinhoodMainnet.id];
}

/**
 * When the epoch after the current one begins, in unix seconds.
 * Mirrors `Getters.epochTime()` run backwards.
 */
export function nextEpochStart(
  epochStart: bigint,
  epochPeriod: bigint,
  now: number,
  c: ProtocolConstants,
): number {
  const start = Number(epochStart);
  const period = Number(epochPeriod);
  if (!start || !period) return 0;

  const bootPeriod = Math.floor(period / c.bootstrappingSpeedupFactor);
  const bootTotal = c.bootstrappingPeriod * bootPeriod;

  if (now < start) return start;
  if (now < start + bootTotal) {
    const elapsed = Math.floor((now - start) / bootPeriod);
    return start + (elapsed + 1) * bootPeriod;
  }
  const elapsed = Math.floor((now - start - bootTotal) / period);
  return start + bootTotal + (elapsed + 1) * period;
}

/**
 * Epochs a bond bought at `epoch` vests before it can be claimed.
 *
 * Mirrors `Getters.bondVestingEpochs()`. The target is wall-clock rather than
 * a count: bootstrap epochs run at a third of the normal length, so a genesis
 * bond needs proportionally more of them, and one bought near the end of
 * bootstrapping is served partly by short epochs and partly by full-length
 * ones. Kept in step with the contract - the chain decides, this only labels.
 */
export function bondVestingEpochsAt(epoch: bigint, c: ProtocolConstants): number {
  const current = Number(epoch);
  if (current > c.bootstrappingPeriod) return c.bondVestingEpochs;

  const full = c.bondVestingEpochs * c.bootstrappingSpeedupFactor;
  const short = c.bootstrappingPeriod + 1 - current;
  if (short >= full) return full;

  const slow = c.bootstrappingSpeedupFactor - 1;
  return c.bondVestingEpochs + Math.floor((short * slow + slow) / c.bootstrappingSpeedupFactor);
}

export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  return h > 0 ? `${h}:${mm}:${String(s).padStart(2, "0")}` : `${mm}:${String(s).padStart(2, "0")}`;
}
