import { EpochCard } from "@/components/EpochCard";
import { FloorGauge } from "@/components/FloorGauge";
import { ActivityFeed } from "@/components/ActivityFeed";
import { SupplyStrip } from "@/components/SupplyStrip";
import { CoinMark } from "@/components/CoinMark";
import { Tile } from "@/components/ui";

export default function Home() {
  return (
    <div className="flex flex-col gap-8">
      <section className="grid items-center gap-10 pt-4 sm:pt-10 lg:grid-cols-[1fr_auto]">
        <div>
          <p className="eyebrow">Elastic Supply Protocol</p>
          <h1 className="mt-3 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            <span className="gilt-text">Liquid Supply</span>
            <br />
            <span className="text-chalk">Dollar</span>
          </h1>
          <p className="mt-5 text-lg font-medium text-chalk sm:text-xl">
            Take the coin for <span className="gilt-text">elastic money</span>.
          </p>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-haze">
            <span className="text-chalk">LSD</span>, after <span className="text-chalk">£sd</span>: librae, solidi,
            denarii, the money of Sherwood&apos;s England. Also the other thing. A dollar that reprices its own supply,
            with a treasury floor anyone can redeem against.
          </p>
        </div>

        <CoinMark idPrefix="hero" className="coin-float mx-auto h-44 w-44 lg:h-64 lg:w-64" />
      </section>

      <EpochCard />
      <FloorGauge />
      <SupplyStrip />
      <ActivityFeed />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile href="/portfolio" title="Spoils" glyph="◎" blurb="Your LSD, and what the Coffer owes it." />
        <Tile href="/wallet" title="The Band" glyph="◈" blurb="Stake LSD with the band, earn every expansion." />
        <Tile href="/liquidity" title="Quivers" glyph="≋" blurb="Fill a quiver: pair LSD with cash or a stock, earn LSD." />
        <Tile href="/bonds" title="Pledges" glyph="⬡" blurb="Pledge cash or stocks to the Coffer for discounted LSD." />
        <Tile href="/trade" title="Trade" glyph="⇄" blurb="Buy or sell LSD against the pool." />
        <Tile href="/coupons" title="Tallies" glyph="◇" blurb="Cut a tally: burn LSD under the peg, collect in expansion." />
        <Tile href="/stats" title="The Watch" glyph="◐" blurb="Supply, debt and what the oracle sees." />
      </div>
    </div>
  );
}
