"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, usePublicClient, useReadContracts } from "wagmi";
import { formatUnits, isAddress, type Address } from "viem";
import { implementationAbi, proposalEvent, commitEvent } from "@/config/abis";
import { candidateLabel } from "@/config/candidates";
import { useAddresses } from "@/hooks/useAddresses";
import { useProtocol } from "@/hooks/useProtocol";
import { RawAction } from "./actions";
import { ConnectPrompt, Notice, Panel } from "./ui";

/**
 * The Moot - governance.
 *
 * ESD-style: a proposal is a deployed contract, nominated by its first vote
 * from anyone holding 1% of bonded stake, voted on for a fixed window, then
 * committed if it cleared quorum with more approve than reject. Creating a
 * candidate is a compile-and-deploy step (see the docs); this page is where
 * everyone else reads them, votes, and commits.
 *
 * Proposals are read off the chain's own Proposal/Commit event history, so
 * nothing has to be listed here by hand.
 */

const QUORUM = 0.33; // GOVERNANCE_QUORUM, a compiled constant
const VOTE_APPROVE = 1;
const VOTE_REJECT = 2;

type Candidate = { address: Address; proposer: Address; startBlock: bigint };

type Row = {
  address: Address;
  proposer: Address;
  start: bigint;
  period: bigint;
  approve: bigint;
  reject: bigint;
  votesFor: bigint;
  bondedAtEnd: bigint;
  myVote: number;
  committed: boolean;
};

function short(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function fmt(v: bigint): string {
  const n = Number(formatUnits(v, 18));
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function GovernPanel() {
  const { addresses, configured, chainId } = useAddresses();
  const { address: account } = useAccount();
  const client = usePublicClient({ chainId });
  const { epoch, lsdsSupply } = useProtocol();

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [committed, setCommitted] = useState<Set<string>>(new Set());
  const [scanned, setScanned] = useState(false);
  const seen = useRef<Set<string>>(new Set());

  // Pull Proposal and Commit history off the chain.
  const scan = useCallback(async () => {
    if (!configured || !client || !addresses) return;
    try {
      const head = await client.getBlockNumber();
      const span = BigInt(3_000_000);
      const from = head > span ? head - span : BigInt(0);
      const chunk = BigInt(500_000);
      const found: Candidate[] = [];
      const done = new Set<string>();
      for (let lo = from; lo <= head; lo += chunk) {
        const hi = lo + chunk - BigInt(1) > head ? head : lo + chunk - BigInt(1);
        const [props, commits] = await Promise.all([
          client.getLogs({ address: addresses.root, event: proposalEvent, fromBlock: lo, toBlock: hi }),
          client.getLogs({ address: addresses.root, event: commitEvent, fromBlock: lo, toBlock: hi }),
        ]);
        for (const l of props) {
          const c = l.args.candidate as Address | undefined;
          if (c && !seen.current.has(c.toLowerCase())) {
            seen.current.add(c.toLowerCase());
            found.push({ address: c, proposer: (l.args.account as Address) ?? c, startBlock: l.blockNumber ?? BigInt(0) });
          }
        }
        for (const l of commits) {
          const c = l.args.candidate as Address | undefined;
          if (c) done.add(c.toLowerCase());
        }
      }
      if (found.length) setCandidates((prev) => [...found.reverse(), ...prev]);
      setCommitted(done);
    } catch {
      /* transient RPC hiccup - the interval retries */
    } finally {
      setScanned(true);
    }
  }, [configured, client, addresses]);

  useEffect(() => {
    scan();
    const id = setInterval(scan, 20_000);
    return () => clearInterval(id);
  }, [scan]);

  // Per-candidate on-chain state, in one multicall.
  const reads = useMemo(() => {
    if (!addresses) return [];
    const abi = implementationAbi;
    const root = addresses.root;
    return candidates.flatMap((c) => [
      { address: root, abi, functionName: "startFor", args: [c.address] },
      { address: root, abi, functionName: "periodFor", args: [c.address] },
      { address: root, abi, functionName: "approveFor", args: [c.address] },
      { address: root, abi, functionName: "rejectFor", args: [c.address] },
      { address: root, abi, functionName: "votesFor", args: [c.address] },
      { address: root, abi, functionName: "recordedVote", args: [account ?? c.address, c.address] },
    ]);
  }, [candidates, addresses, account]);

  const { data: readRaw } = useReadContracts({
    contracts: reads as never,
    query: { enabled: configured && candidates.length > 0, refetchInterval: 12_000 },
  });
  const readData = readRaw as ReadonlyArray<{ result?: unknown }> | undefined;

  // Second pass: totalBondedAt(end-1) for each, the quorum denominator.
  const endEpochs = useMemo(() => {
    if (!readData) return [];
    return candidates.map((_, i) => {
      const start = readData[i * 6]?.result as bigint | undefined;
      const period = readData[i * 6 + 1]?.result as bigint | undefined;
      if (start === undefined || period === undefined) return undefined;
      return start + period - BigInt(1);
    });
  }, [readData, candidates]);

  const { data: bondedRaw } = useReadContracts({
    contracts: useMemo(
      () =>
        addresses
          ? endEpochs.map((e) => ({
              address: addresses.root,
              abi: implementationAbi,
              functionName: "totalBondedAt",
              args: [e ?? BigInt(0)],
            }))
          : [],
      [endEpochs, addresses],
    ) as never,
    query: { enabled: configured && endEpochs.length > 0, refetchInterval: 12_000 },
  });
  const bondedData = bondedRaw as ReadonlyArray<{ result?: unknown }> | undefined;

  const rows: Row[] = useMemo(() => {
    if (!readData) return [];
    return candidates.map((c, i) => {
      const g = (k: number) => readData[i * 6 + k]?.result as bigint | undefined;
      return {
        address: c.address,
        proposer: c.proposer,
        start: (g(0) as bigint) ?? BigInt(0),
        period: (g(1) as bigint) ?? BigInt(0),
        approve: (g(2) as bigint) ?? BigInt(0),
        reject: (g(3) as bigint) ?? BigInt(0),
        votesFor: (g(4) as bigint) ?? BigInt(0),
        bondedAtEnd: (bondedData?.[i]?.result as bigint | undefined) ?? BigInt(0),
        myVote: Number((readData[i * 6 + 5]?.result as bigint | number | undefined) ?? 0),
        committed: committed.has(c.address.toLowerCase()),
      };
    });
  }, [candidates, readData, bondedData, committed]);

  if (!configured) {
    return (
      <Notice>
        Governance reads from a live deployment. Once the protocol is running, proposals show up here as
        they are nominated.
      </Notice>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel title="How the Moot works">
        <p className="text-sm leading-relaxed text-haze">
          A proposal is a deployed contract. Anyone holding <span className="text-chalk">1%</span> of bonded
          stake nominates one by casting its first vote; then it is open for a fixed window, and passes if
          turnout clears <span className="text-chalk">33%</span> of bonded stake with more approve than
          reject. Creating a candidate is a compile-and-deploy step done in Remix. This page is where the
          band reads them, votes, and commits the ones that pass.
        </p>
        <p className="mt-3 text-xs text-haze">
          Your voting weight is your bonded stake at the moment you vote. You must be bonded to vote, and
          voting locks your stake until the window ends.
        </p>
      </Panel>

      {account && <NominatePanel root={addresses!.root} onDone={scan} />}

      {scanned && rows.length === 0 && (
        <Notice>
          No proposals yet. When someone nominates one, it appears here for voting. Nothing needs to be
          listed by hand: the page reads the chain&apos;s own proposal history.
        </Notice>
      )}

      {rows.map((r) => (
        <ProposalCard
          key={r.address}
          row={r}
          epoch={epoch}
          lsdsSupply={lsdsSupply}
          root={addresses!.root}
          account={account}
          onDone={scan}
        />
      ))}
    </div>
  );
}

/**
 * The first vote is the nomination, and a candidate nobody has voted on yet
 * has no event to be listed from - so nominating needs the address typed in
 * once. After that first approve lands, the candidate shows up as a card
 * like any other and this field is done with it.
 */
function NominatePanel({ root, onDone }: { root: Address; onDone: () => void }) {
  const [input, setInput] = useState("");
  const valid = isAddress(input.trim());

  return (
    <Panel
      title="Nominate a candidate"
      hint="Paste a deployed proposal contract's address. Nominating casts your approve; it needs 1% of bonded stake and a Frozen account."
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="0x… candidate address"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-chalk outline-none placeholder:text-haze/60 focus:border-[var(--color-gold)]/50"
        />
        <div className="sm:w-56">
          <RawAction
            address={root}
            abi={implementationAbi}
            functionName="vote"
            args={[input.trim() as Address, VOTE_APPROVE]}
            buttonLabel="Nominate · approve"
            variant="gilt"
            disabled={!valid}
            onSuccess={() => {
              setInput("");
              onDone();
            }}
          />
        </div>
      </div>
    </Panel>
  );
}

function ProposalCard({
  row,
  epoch,
  lsdsSupply,
  root,
  account,
  onDone,
}: {
  row: Row;
  epoch: bigint | undefined;
  lsdsSupply: bigint | undefined;
  root: Address;
  account: Address | undefined;
  onDone: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Until the per-candidate reads land, start and period are zero, which
  // would make the window look ended and the tally look passed - the
  // buttons flickered through every state on each refresh. No verdicts,
  // no actions until the data is real.
  const loaded = row.period > BigInt(0);
  const endsAfter = row.start + row.period - BigInt(1);
  const now = epoch ?? BigInt(0);
  const open = loaded && !row.committed && now <= endsAfter;
  const ended = loaded && !row.committed && now > endsAfter;

  // The contract measures quorum against bonded stake at the window's END,
  // a snapshot that does not exist while voting is still open. Until it
  // does, today's bonded supply is the honest stand-in - the number can
  // still drift as stake moves, and the label below says so.
  const endSnapshot = row.bondedAtEnd > BigInt(0);
  const quorumBase = endSnapshot ? row.bondedAtEnd : (lsdsSupply ?? BigInt(0));
  const turnout = quorumBase > BigInt(0) ? Number(row.votesFor) / Number(quorumBase) : 0;
  const passed = loaded && turnout > QUORUM && row.approve > row.reject;

  const total = row.approve + row.reject;
  const approvePct = total > BigInt(0) ? Number((row.approve * BigInt(100)) / total) : 0;

  const status = !loaded
    ? { label: "reading…", cls: "text-haze" }
    : row.committed
      ? { label: "Enacted", cls: "text-lime-300" }
      : open
        ? { label: `Voting · ends epoch ${String(endsAfter + BigInt(1))}`, cls: "text-[var(--color-gold)]" }
        : passed
          ? { label: "Passed · ready to commit", cls: "text-lime-300" }
          : { label: "Did not pass", cls: "text-haze" };

  const label = candidateLabel(row.address);

  return (
    <section className="panel">
      {/* one-line header; everything else lives behind the click */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left sm:px-6"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm text-chalk">{label ?? short(row.address)}</span>
          {row.myVote === VOTE_APPROVE && <span className="shrink-0 text-xs text-lime-300">✓ approved</span>}
          {row.myVote === VOTE_REJECT && <span className="shrink-0 text-xs text-haze">✗ rejected</span>}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className={`font-mono text-xs ${status.cls}`}>{status.label}</span>
          <span className={`text-haze transition-transform ${expanded ? "rotate-180" : ""}`}>▾</span>
        </span>
      </button>

      {expanded && (
        <div className="border-t border-white/[0.06] px-5 pb-5 pt-4 sm:px-6">
          <div className="mb-3 text-right font-mono text-[0.65rem] text-haze">
            {short(row.address)} · proposed by {short(row.proposer)}
          </div>

          {/* tally bar */}
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-lime-300">Approve {fmt(row.approve)}</span>
            <span className="text-haze">Reject {fmt(row.reject)}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-[var(--color-leaf)]" style={{ width: `${approvePct}%` }} />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[0.65rem] text-haze">
            <span>
              turnout {(turnout * 100).toFixed(1)}% of bonded{endSnapshot ? "" : " (so far - final tally uses the window's end)"}
            </span>
            <span>quorum {(QUORUM * 100).toFixed(0)}%</span>
          </div>

          {/* actions */}
          {!loaded ? null : !account ? (
            <div className="mt-4">
              <ConnectPrompt what="vote" />
            </div>
          ) : open ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <RawAction
                address={root}
                abi={implementationAbi}
                functionName="vote"
                args={[row.address, VOTE_APPROVE]}
                buttonLabel={row.myVote === VOTE_APPROVE ? "Approved" : "Approve"}
                variant="gilt"
                disabled={row.myVote === VOTE_APPROVE}
                onSuccess={onDone}
              />
              <RawAction
                address={root}
                abi={implementationAbi}
                functionName="vote"
                args={[row.address, VOTE_REJECT]}
                buttonLabel={row.myVote === VOTE_REJECT ? "Rejected" : "Reject"}
                variant="ghost"
                disabled={row.myVote === VOTE_REJECT}
                onSuccess={onDone}
              />
            </div>
          ) : ended && passed ? (
            <div className="mt-4">
              <RawAction
                address={root}
                abi={implementationAbi}
                functionName="commit"
                args={[row.address]}
                buttonLabel="Commit and enact this proposal"
                variant="gilt"
                onSuccess={onDone}
              />
              <p className="mt-1.5 text-xs text-haze">
                Anyone can commit a passed proposal. It becomes the protocol&apos;s new logic on the next block.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
