"use client";

import { useAccount, useReadContracts } from "wagmi";
import { useAddresses } from "@/hooks/useAddresses";
import { useProtocol } from "@/hooks/useProtocol";
import { useBandYield } from "@/hooks/useBandYield";
import { erc20Abi, implementationAbi } from "@/config/abis";
import { formatAmount, formatPercent, statusLabel } from "@/lib/format";
import { AmountAction, ApproveGate } from "./actions";
import { ConnectPrompt, Field, Panel, Stat, StatRow } from "./ui";

function pct(v: number | undefined): string {
  if (v === undefined) return "—";
  return `${(v * 100).toFixed(2)}%`;
}

export function WalletPanel() {
  const { addresses, configured } = useAddresses();
  const { address: account } = useAccount();
  const { lsdsSupply } = useProtocol();
  const bandYield = useBandYield();

  const { data, refetch } = useReadContracts({
    contracts: [
      { address: addresses?.dollar, abi: erc20Abi, functionName: "balanceOf", args: [account!] },
      { address: addresses?.root, abi: implementationAbi, functionName: "balanceOf", args: [account!] },
      { address: addresses?.root, abi: implementationAbi, functionName: "balanceOfStaged", args: [account!] },
      { address: addresses?.root, abi: implementationAbi, functionName: "balanceOfBonded", args: [account!] },
      { address: addresses?.root, abi: implementationAbi, functionName: "statusOf", args: [account!] },
    ],
    query: { enabled: configured && !!account, refetchInterval: 12_000 },
  });


  const yieldPanel = (
    <Panel title="What the band pays">
      <StatRow>
        <Stat label="Predicted weekly" value={pct(bandYield.weekly)} accent />
        <Stat label="Predicted APR" value={pct(bandYield.annualized)} />
        <Stat
          label="Expansions, 7d"
          value={bandYield.expansions === undefined ? "—" : String(bandYield.expansions)}
        />
      </StatRow>
      <p className="mt-4 text-xs leading-relaxed text-haze">
        From the band&apos;s share of the last week&apos;s expansions. The protocol expands in epochs
        where LSD closes over a dollar.
      </p>
    </Panel>
  );

  if (!account) {
    return (
      <div className="flex flex-col gap-6">
        <Panel title="The Band">
          <ConnectPrompt what="bond LSD" />
        </Panel>
        {yieldPanel}
      </div>
    );
  }

  const r = data?.map((x) => x.result);
  const wallet = r?.[0] as bigint | undefined;
  const shares = r?.[1] as bigint | undefined;
  const staged = r?.[2] as bigint | undefined;
  const bonded = r?.[3] as bigint | undefined;
  const status = r?.[4] as number | undefined;

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Your position">
        <StatRow>
          <Stat label="LSD in wallet" value={formatAmount(wallet, 18, 2)} />
          <Stat label="Staged" value={formatAmount(staged, 18, 2)} unit="LSD" />
          <Stat label="Bonded" value={formatAmount(bonded, 18, 2)} unit="LSD" accent />
          <Stat label="Share of DAO" value={formatPercent(shares, lsdsSupply)} unit="%" />
          <Stat label="Status" value={statusLabel(status)} />
        </StatRow>
        <p className="mt-4 text-xs leading-relaxed text-haze">
          LSD you deposit sits <span className="text-chalk">staged</span>: parked in the DAO but idle, withdrawable
          whenever you want. <span className="text-chalk">Joining the band</span> (bonding, in the contract) puts it to work, earning a share of every
          expansion. Your share is held as LSDS, and its count stays put while the LSD behind it grows.
        </p>
      </Panel>

      {yieldPanel}

      <Panel title="Stage">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Approve LSD">
            <ApproveGate token={addresses.dollar} spender={addresses.root} owner={account} label="Approve LSD" />
          </Field>
          <Field label="Deposit from wallet">
            <AmountAction
              address={addresses.root}
              abi={implementationAbi}
              functionName="deposit"
              decimals={18}
              max={wallet}
              buttonLabel="Deposit"
              onSuccess={refetch}
            />
          </Field>
          <Field label="Withdraw to wallet">
            <AmountAction
              address={addresses.root}
              abi={implementationAbi}
              functionName="withdraw"
              decimals={18}
              max={staged}
              buttonLabel="Withdraw"
              onSuccess={refetch}
            />
          </Field>
        </div>
      </Panel>

      <Panel title="Join the band">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Join: bond staged LSD">
            <AmountAction
              address={addresses.root}
              abi={implementationAbi}
              functionName="bond"
              decimals={18}
              max={staged}
              buttonLabel="Join"
              onSuccess={refetch}
            />
          </Field>
          <Field label="Leave: unbond to staged">
            <AmountAction
              address={addresses.root}
              abi={implementationAbi}
              functionName="unbondUnderlying"
              decimals={18}
              max={bonded}
              buttonLabel="Leave"
              onSuccess={refetch}
            />
          </Field>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-haze">
          Joining or leaving the band leaves your account <span className="text-chalk">Fluid</span> for sixteen epochs
          (four days), and deposit and withdraw are refused while it is. That is the anti-manipulation guard doing its
          job, not a failure. Joining from staged stays open the whole time. Deposit more than you bond while you are
          Frozen, and the staged rest can join whenever you like.
        </p>
      </Panel>
    </div>
  );
}
