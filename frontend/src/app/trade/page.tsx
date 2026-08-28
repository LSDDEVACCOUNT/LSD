import { SwapPanel } from "@/components/SwapPanel";

export default function TradePage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="eyebrow">Uniswap v4</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-chalk">Trade</h1>
      </header>
      <SwapPanel />
    </div>
  );
}
