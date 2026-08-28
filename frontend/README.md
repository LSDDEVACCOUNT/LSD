# LSD Protocol Frontend

Next.js + wagmi/viem dashboard for the LSD protocol (DAO bonding + LP pool).
Connects to whatever injected wallet the browser provides (Rabby, MetaMask,
...) - no external API keys needed.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Point it at a deployment

Everything network-specific lives in one file:
**`src/config/addresses.ts`**. Fill in the five addresses of the
deployment. Nothing else in this app hardcodes an address.

Chain definitions (RPC URLs, explorer, chain ID) live in
`src/config/chains.ts`.

## Structure

- `src/config/` - chains, per-network addresses, hand-written ABIs, wagmi config
- `src/components/` - `StatsPanel` (protocol stats), `DaoPanel` (DAO-level
  bonding), `PoolPanel` (LP pool), `TestnetTools` (testnet-only USDC faucet),
  `actions.tsx` (generic write-contract building blocks)
- `src/hooks/useAddresses.ts` - resolves the connected chain's addresses
