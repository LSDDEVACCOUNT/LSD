"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

/* The protocol reference, one section per click, no long scroll. Same
   content and numbers as docs/PROTOCOL.md, told through the Sherwood names. */

function KV({ rows, head }: { rows: [string, string, string?][]; head: string[] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-white/[0.07]">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                className="border-b border-white/[0.08] px-4 py-2.5 text-left font-mono text-[0.65rem] uppercase tracking-[0.1em] text-haze"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-white/[0.04] last:border-0">
              <td className="px-4 py-2.5 font-mono text-[0.82rem] text-chalk">{r[0]}</td>
              <td className={`px-4 py-2.5 ${r[2] !== undefined ? "font-mono text-chalk" : "text-haze"}`}>{r[1]}</td>
              {r[2] !== undefined && <td className="px-4 py-2.5 text-haze">{r[2]}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Sec = { n: string; id: string; title: string; body: ReactNode };

const SECTIONS: Sec[] = [
  {
    n: "00",
    id: "overview",
    title: "Overview",
    body: (
      <>
        <p>
          The <strong>Liquid Supply Dollar</strong> is an elastic-supply dollar with a floor under it.
          The supply chases a dollar the way Empty Set Dollar&apos;s did. The floor is new: a{" "}
          <strong>Coffer</strong> of real assets that anyone can claim against by burning LSD, with no
          oracle and no permission step in the way.
        </p>
        <p>
          The ticker reads more than one way, and every reading is meant. <strong>£sd</strong>, spoken &quot;L-S-D&quot;,
          was the English money of account for a thousand years: <em>librae, solidi, denarii</em>, the
          pounds, shillings and pence that the Sheriff of Nottingham taxed and Robin of Loxley handed
          back. This is the coin of Sherwood struck again, with Loxley&apos;s arrow across its face. The
          other reading is also intentional.
        </p>
        <p>
          Every number in this reference is a compiled constant in the contracts unless it says otherwise.
          The deployed contracts use forest names; the first section, <em>The band</em>, is the map.
        </p>
      </>
    ),
  },
  {
    n: "01",
    id: "names",
    title: "The band",
    body: (
      <>
        <p>
          The protocol has one permanent address and a cast of contracts around it. On the explorer they
          read as a Sherwood roll call. The names carry no logic; they just make the thing legible when
          you call it.
        </p>
        <KV
          head={["Contract", "Role"]}
          rows={[
            ["Sherwood", "the proxy: the one permanent address, the protocol itself"],
            ["Greenwood", "the logic behind Sherwood: bonding, regulation, the Coffer, governance"],
            ["Loxley", "the LSD token"],
            ["Longbow + Watchtower", "the epoch price oracle and the V4 hook it reads"],
            ["Quiver", "a liquidity position; one per pair"],
            ["TollGate", "the 1% swap-fee hook the stock pools share"],
          ]}
        />
        <p className="mt-4">
          The interface speaks the same language. Every screen pairs the Sherwood word with the plain
          one, and the contract calls underneath never change:
        </p>
        <KV
          head={["Sherwood", "Plain DeFi", "Contract call"]}
          rows={[
            ["join / leave the Band", "stake / unstake LSD in the DAO", "bond(), unbondUnderlying()"],
            ["fill a Quiver", "provide + stake LP", "deposit(), bond()"],
            ["pledge / collect", "buy / claim a treasury bond", "purchaseBond(), claimBond()"],
            ["cut / collect a tally", "buy / redeem a coupon", "purchaseCoupons(), redeemCoupons()"],
            ["reach into the Coffer", "redeem against the treasury", "redeem()"],
            ["stand the Watch", "advance the epoch", "advance()"],
            ["sit the Moot", "vote on / commit a proposal", "vote(), commit()"],
          ]}
        />
        <p className="mt-4">
          This also untangles a naming collision: the contracts inherit ESD&apos;s <code>bond()</code> for
          staking <em>and</em> Olympus-style bonds for the treasury. In the interface, only a{" "}
          <strong>pledge</strong> is a bond; staking is joining the band.
        </p>
        <p className="mt-4">
          An address from a chat, a reply or a DM is not the protocol. The real addresses live in the
          repository and nowhere else.
        </p>
      </>
    ),
  },
  {
    n: "02",
    id: "tokens",
    title: "Tokens",
    body: (
      <>
        <KV
          head={["Token", "What it is"]}
          rows={[
            ["LSD", "the dollar: an 18-decimal ERC-20, elastic in supply, the only token minted or burned"],
            ["LSDS", "a bonded stake in the DAO; not transferable, a position rather than a coin"],
          ]}
        />
        <p className="mt-4">
          A stake&apos;s LSD value rises over time: the DAO&apos;s balance grows with every expansion while
          the stake supply does not.
        </p>
      </>
    ),
  },
  {
    n: "03",
    id: "clock",
    title: "The epoch clock",
    body: (
      <>
        <p>
          The clock is the <strong>epoch</strong>: six hours, four a day. It does not run at deployment:
          the treasurer starts it once with <code>launch()</code>, and it begins at the next whole epoch
          boundary. Until then <code>advance()</code> reverts and the protocol is inert. Once running,
          nothing moves until someone calls <code>advance()</code>, which steps exactly one epoch: the
          bonding snapshot, the price capture and supply decision, and the payout to whoever made the
          call. There is no way to stop the clock once started.
        </p>
        <p>
          That payout is a flat <strong>100 LSD</strong> during genesis. Afterwards it is what the call
          actually cost in gas plus 25%, priced through a Chainlink ETH/USD feed and clamped between{" "}
          <strong>5 and 100 LSD</strong>. The ceiling matters: the caller picks the gas price, and without
          a cap a rigged gas price paid back at 125% would be a mint faucet.
        </p>
      </>
    ),
  },
  {
    n: "04",
    id: "regulation",
    title: "Supply regulation",
    body: (
      <>
        <p>
          Once an epoch the DAO reads a time-weighted price from its own Uniswap V4 pool, through the{" "}
          <strong>Watchtower</strong> hook. It vouches for a price only while the pool holds liquidity;
          otherwise the protocol does nothing that epoch.
        </p>
        <p>
          <strong>Above a dollar</strong>, supply expands by the excess, throttled by an earned limit.
          The limit grows by half each epoch the price actually pins it, up to a 10% ceiling, and halves
          on every contraction epoch, down to a 2.5% floor. It leaves genesis at the ceiling, since
          genesis is forty-five pinned expansions in a row, so continuing demand carries straight on at
          10%. Below the limit, expansion is the deviation itself and the throttle stays put. A quarter
          of each expansion goes to liquidity providers, split across every pool by weight; the rest goes
          to DAO stakers, coupons first.
        </p>
        <div className="doc-formula">{`pinned epoch:      limit = min( limit × 1.5 , 10% )
contraction epoch: limit = max( limit ÷ 2   , 2.5% )`}</div>
        <p className="mt-3">
          From the floor, one manipulated oracle epoch mints 2.5%, not 10%. Earning the full rate back
          takes about 30 hours of sustained demand: 2.5, 3.75, 5.6, 8.4, 10.
        </p>
        <p>
          <strong>Below a dollar</strong>, the protocol sells <strong>tallies</strong> (coupons): burn LSD
          now, hold a claim on more when expansion returns. They expire after 90 days and pay nothing if
          it never does. A tally is a bet on recovery; the Coffer is what replaces that bet as the
          downside.
        </p>
        <p className="mt-2">Only three things ever mint LSD, and they are independent of each other:</p>
        <KV
          head={["Mint", "Trigger", "Backed by"]}
          rows={[
            ["Expansion", "price above the peg at advance()", "nothing (dilutes the backing); paid to tallies, then the band, then quivers"],
            ["Pledge collection", "your claim after the 24h vest", "the asset you pledged, already in the Coffer"],
            ["Watch pay", "whoever calls advance()", "nothing; 5 to 100 LSD, priced from gas"],
          ]}
        />
      </>
    ),
  },
  {
    n: "05",
    id: "coffer",
    title: "The Coffer",
    body: (
      <>
        <p>
          The <strong>Coffer</strong> is a treasury of real assets: the stablecoin LSD trades against,
          plus any stocks governance has listed. Two doors fill it, one door pays out.
        </p>
        <p>
          <strong>Pledges</strong> (treasury bonds)<strong>.</strong> Hand the Coffer a reserve asset, be owed LSD a day later. The price is
          the oracle price minus a discount (25% at launch, adjustable between 0 and 25%), with one clamp
          that outranks everything:
        </p>
        <div className="doc-formula">effective price = max( oracle price × (1 − discount) , backing per LSD )</div>
        <p className="mt-3">
          A bond at backing grows the Coffer and the supply in step, so no discount and no market price can
          lower the floor, and the window never closes on the discount alone. The treasurer holds one
          emergency brake: <code>pauseBonds()</code> stops new pledges instantly, and only a governance
          vote reopens them. A brake can only ever close a door, which is the safe direction for a
          single key to hold.
        </p>
        <p>
          <strong>Swap fees.</strong> Every trade pays a toll: 0.05% on the LSD/USDG oracle pool, where
          peg arbitrage has to stay cheap, and 1% on the stock pools through <strong>TollGate</strong>,
          which are not the peg&apos;s venue.
          Anyone can call <code>sweep()</code>: the cash and stock side becomes backing, the LSD side is
          burned. This is the only part of the floor that grows without anyone deciding to bond.
        </p>
        <p>
          <strong>Reaching in</strong> (redemption)<strong>.</strong> Burn LSD and take your exact
          pro-rata slice of every asset the Coffer holds. No oracle, no vote, no venue, no rate limit.
        </p>
        <div className="doc-formula">payout(asset) = coffer(asset) × amount / totalSupply</div>
        <p className="mt-3">
          Burning <code>d</code> out of a supply <code>S</code> against holdings <code>T</code> pays{" "}
          <code>T·d/S</code> and leaves <code>T/S</code> per token behind. A run shrinks both sides
          together, and every remaining holder is exactly as backed as before. Rounding only ever ticks
          the floor up. Redemption is only worth using when LSD trades under its backing, which is how a
          floor should behave.
        </p>
      </>
    ),
  },
  {
    n: "06",
    id: "reserves",
    title: "Reserves beyond cash",
    body: (
      <>
        <p>
          Governance can list tokenised stocks as reserves, each with the Chainlink feed Robinhood Chain
          publishes for it. Feeds are trusted in one direction only: a feed decides what a bond pays out,
          and a feed that is stale, dead or non-positive closes bonding for every asset at once.
          Redemption reads no feed and cannot be closed by one.
        </p>
        <p>
          The feeds follow the market&apos;s 24/5 clock, but the stocks themselves trade on-chain around
          the clock, in deep USDG pools. So each reserve also names a <strong>Spyglass</strong>: a
          read-only adapter over that pool, and the Coffer takes the <strong>lower</strong> of the two
          prices:
        </p>
        <div className="doc-formula">reserve price = min( feed price , pool spot price )</div>
        <p className="mt-3">
          A bigger payout would need a higher valuation, and a minimum cannot be pushed up. Through a
          weekend the feed freezes at Friday&apos;s close while the pool trades on, so a stock that gaps
          down is valued at the live, lower price and a frozen feed can never overpay a bond. The
          staleness window is 3 days for the same reason: wide enough to ride the weekend, with the pool
          keeping the conservative eye open. And the min only applies inside a band: more than 10% apart,
          one of the two sources is wrong, and the Coffer refuses to price the asset at all. That closes
          pledges and touches nothing else. Listing a reserve is the one move that could drain the
          protocol, so it takes a governance vote and nothing less.
        </p>
      </>
    ),
  },
  {
    n: "07",
    id: "genesis",
    title: "Genesis",
    body: (
      <>
        <p>
          For its first <strong>45 epochs</strong> (two hours each, 3.75 days) the protocol bootstraps:
          the oracle is ignored, expansion is pinned to +10% an epoch, and supply multiplies roughly 73×.
          Entering early means entering before that multiplication.
        </p>
        <KV
          head={["", "Genesis", "Normal"]}
          rows={[
            ["Bond price", "flat 5.00 USDG", "oracle − discount, clamped at backing"],
            ["Discount", "none", "0 to 25%"],
            ["Epoch capacity", "20% of supply", "10% of supply"],
            ["Advance pay", "flat 100 LSD", "gas + 25%, clamped 5 to 100"],
            ["Bond vesting", "12 epochs (~24 h)", "4 epochs (~24 h)"],
          ]}
        />
        <p className="mt-4">
          The genesis price is flat and takes no market input. A thin pool at genesis would read as a
          &quot;market&quot;, so the door reads nothing and can be fed nothing. The 20% cap is wider than
          normal but still a cap: it bounds how much of the genesis multiplication one epoch of capital
          can corner, so the distribution stays open to more than the fastest money.
        </p>
      </>
    ),
  },
  {
    n: "08",
    id: "liquidity",
    title: "Liquidity",
    body: (
      <>
        <p>
          LP rewards are not confined to the main pair. The DAO carries a weighted schedule of pools and
          splits the LP quarter of every expansion across it. An LSD/stock pair earns the same way
          LSD/USDG does.
        </p>
        <p>
          The USDG pool keeps the largest weight on purpose: the oracle reads its price from there, and if
          it thins out the protocol stops regulating. LSD is never priced against a stock pair. Positions
          are staged (idle) or bonded (earning, exit-locked). The DAO lock is 4 days and the pool lock 3
          days; the riskier position carries the shorter lock, because the oracle depends on LPs showing
          up. The lock guards the edges, not the inside: while an account is Fluid, deposit and withdraw
          are refused, but bonding from staged and unbonding back to it stay open. Keeping a staged
          buffer is how you top a position up without waiting out the lock.
        </p>
      </>
    ),
  },
  {
    n: "09",
    id: "governance",
    title: "Governance",
    body: (
      <>
        <p>
          There are no admin keys. The only way to change the protocol is to deploy a candidate, have
          bonded stakers vote it through (a 7-day window, 33% quorum, proposals from any staker with 1%
          of bonded supply) and commit it through <strong>Sherwood</strong>. The repository ships
          ready-made proposals: listing and delisting reserves, wiring a pool cross-check, adding pools
          and weights, tuning the staleness window, retiring the treasurer.
        </p>
        <p>
          The <strong>treasurer</strong>, at first the deploying account, is the one non-governance role.
          It starts the epoch clock, once, with <code>launch()</code>; it can stop new pledges instantly
          with <code>pauseBonds()</code>, which only governance can undo; it can move the bond discount
          inside 0 to 25%; and it can point the gas oracle at a feed. Nothing else: it cannot move
          funds, mint, list a reserve or block redemption. Governance can retire it by vote.
        </p>
      </>
    ),
  },
  {
    n: "10",
    id: "parameters",
    title: "Parameters",
    body: (
      <KV
        head={["Constant", "Value", "Meaning"]}
        rows={[
          ["EPOCH_PERIOD", "6 h", "four epochs a day"],
          ["BOOTSTRAPPING_PERIOD", "45", "~73× over 3.75 days at 2h epochs"],
          ["SUPPLY_CHANGE_LIMIT", "10%", "ceiling of the per-epoch move"],
          ["SUPPLY_RAMP_FLOOR", "2.5%", "floor of the limit; ×1.5 when pinned, ÷2 on contraction; genesis exits at 10%"],
          ["ORACLE_POOL_RATIO", "25%", "LP share of each expansion"],
          ["GENESIS_BOND_PRICE", "5.00", "flat, undiscounted genesis price"],
          ["GENESIS_BOND_SUPPLY_LIMIT", "20% / epoch", "bond capacity while bootstrapping"],
          ["BOND_SUPPLY_LIMIT", "10% / epoch", "bond capacity after"],
          ["BOND_DISCOUNT", "25%", "launch discount; treasurer-set 0 to 25%"],
          ["BOND_VESTING_EPOCHS", "4", "~a day from bond to claim; 12 while bootstrapping"],
          ["RESERVE_MAX_STALENESS", "3 days", "feed age limit, rides the weekend; governable to 7 days"],
          ["RESERVE_MAX_DIVERGENCE", "10%", "max feed/pool disagreement; past it, pledges close"],
          ["DAO_EXIT_LOCKUP_EPOCHS", "16", "4-day DAO exit lock"],
          ["POOL_EXIT_LOCKUP_EPOCHS", "12", "3-day pool exit lock"],
          ["COUPON_EXPIRATION", "360", "coupons expire after 90 days"],
          ["GOVERNANCE_PERIOD / quorum", "28 / 33%", "7-day votes"],
          ["ADVANCE_INCENTIVE", "5 to 100 LSD", "gas + 25%, clamped; flat 100 in genesis"],
          ["swap fee", "0.05% / 1%", "oracle pool / stock pools, swept into the Coffer"],
        ]}
      />
    ),
  },
  {
    n: "11",
    id: "risk",
    title: "Risk",
    body: (
      <div className="flex flex-col divide-y divide-white/[0.06]">
        {(
          [
            ["The mechanism is reflexive", "Expansion rewards exist because holders expect them; the price holds because the rewards exist. Every elastic-supply dollar carries that circularity. The floor changes where the fall stops, not whether falls happen."],
            ["The floor equals the Coffer", "Backing per LSD is small at genesis and grows only as bonds and fees outpace dilution. LSD is redeemable for its share of what the Coffer holds, not for 1.00."],
            ["The stablecoin is an assumption", "The unit of account is USDG; the floor inherits its issuer risk. Listed stocks add issuer and price risk of their own, and a basket redemption pays shares of assets, not a dollar amount."],
            ["Feeds gate bonds", "A Chainlink outage closes bonding until it passes or governance widens the window. Redemption is immune by construction."],
            ["Governance is the boundary", "A proposal that wins a vote can do anything, including delisting the floor. The defense is the quorum, the 7-day window, and stakers reading what they vote on."],
          ] as [string, string][]
        ).map(([h, b]) => (
          <div key={h} className="py-3.5">
            <p className="text-sm font-semibold text-chalk">{h}</p>
            <p className="mt-1 text-sm leading-relaxed text-haze">{b}</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    n: "12",
    id: "contracts",
    title: "Contracts",
    body: (
      <p>
        The source, the tests and the deployed addresses live in one place: the protocol repository. Read
        the code before you trust the dashboard. This page describes what the contracts do; the contracts
        are the authority.
      </p>
    ),
  },
];

export function DocsReader() {
  const [i, setI] = useState(0);

  const go = useCallback((next: number) => {
    if (next < 0 || next >= SECTIONS.length) return;
    setI(next);
    const id = SECTIONS[next].id;
    if (typeof history !== "undefined" && history.replaceState) history.replaceState(null, "", `#${id}`);
    else if (typeof location !== "undefined") location.hash = id;
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  // open on the hash, and follow back/forward
  useEffect(() => {
    const fromHash = () => {
      const h = location.hash.replace("#", "");
      const idx = SECTIONS.findIndex((s) => s.id === h);
      if (idx >= 0) setI(idx);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  // arrow keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || e.metaKey || e.ctrlKey) return;
      if (e.key === "ArrowRight") go(i + 1);
      if (e.key === "ArrowLeft") go(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, go]);

  const cur = SECTIONS[i];
  const prev = i > 0 ? SECTIONS[i - 1] : null;
  const next = i < SECTIONS.length - 1 ? SECTIONS[i + 1] : null;

  return (
    <div className="grid gap-10 lg:grid-cols-[190px_1fr]">
      {/* clickable contents */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-2 px-1.5 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-haze">Contents</p>
        <nav className="doc-toc flex flex-col">
          {SECTIONS.map((s, idx) => (
            <button
              key={s.id}
              onClick={() => go(idx)}
              className={`doc-toc-link text-left ${idx === i ? "is-active" : ""}`}
            >
              <span className="mr-2 text-haze/60">{s.n}</span>
              {s.title}
            </button>
          ))}
        </nav>
      </aside>

      {/* one section */}
      <div className="min-w-0 max-w-2xl">
        <div key={cur.id} className="doc-page">
          <div className="mb-4 flex items-baseline gap-3">
            <span className="doc-mark font-mono">{cur.n}</span>
            <h2 className="doc-h2 gilt-text">{cur.title}</h2>
          </div>
          <div className="doc-prose">{cur.body}</div>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-3 border-t border-white/[0.07] pt-5">
          <button
            onClick={() => prev && go(i - 1)}
            disabled={!prev}
            className="btn btn-ghost flex-col items-start gap-0.5 disabled:opacity-0"
          >
            <span className="font-mono text-[0.6rem] uppercase tracking-wider text-haze">Prev</span>
            <span className="text-sm text-chalk">{prev?.title ?? ""}</span>
          </button>
          <button
            onClick={() => next && go(i + 1)}
            disabled={!next}
            className="btn btn-ghost flex-col items-end gap-0.5 text-right disabled:opacity-0"
          >
            <span className="font-mono text-[0.6rem] uppercase tracking-wider text-haze">Next</span>
            <span className="text-sm text-chalk">{next?.title ?? ""}</span>
          </button>
        </div>

        <p className="mt-6 text-xs text-haze">
          This is an independent protocol. It is not affiliated with Robinhood, and nothing here is
          financial advice.
        </p>
      </div>
    </div>
  );
}
