import type { Address } from "viem";

/**
 * Human names for known proposal contracts. The chain only knows a
 * candidate by its address - what a proposal does lives in its verified
 * source. This map is a courtesy label for the ones the project itself
 * deployed; anything not listed here renders as a bare address, which is
 * exactly the right amount of trust to extend it.
 */
export const CANDIDATE_LABELS: Record<string, string> = {
  // Emission schedule - Quiver v2 generation
  "0x40d11226d665c7774a6092576c2665512c57569d": "AddPool · LSD/NVDA",
  "0x14e73f798a146afa4c74b3cb3bf1477eea4e195d": "AddPool · LSD/SPCX",
  "0x353e042340e16a40b7cbd656426bb472716ab8ef": "AddPool · LSD/AAPL",
  "0xdfa5c8a18c07c4ee1b4d07d866543b51eb899e6e": "AddPool · LSD/SPY",
  "0x79baaf4e1a9cd7e363b7135820327e9c178e6319": "AddPool · LSD/USDG v2",
  "0xfc7c7cd58d425f611fed63902674aeb25e41db45": "SetPoolWeight · retire old USDG pool",

  // Treasury listings
  "0x0c666e2d7e3dc659459d64fa713def089d89e4f2": "ListReserve · NVDA",
  "0x851f45148a9ec752da06fc908c07cb803d09acdc": "ListReserve · SPCX",
  "0x8a3f0f276e0bb1be9d9ba3d3b4156e66b333af7d": "ListReserve · AAPL",
  "0xf90e79a1471d2b7ae85e27d0e37b1f0c35bf5823": "ListReserve · SPY",
  "0x09e13308629552357fbd1f7967306d3df37bbc1d": "SetReservePool · NVDA",
  "0x840708c94c8a8d2bc2a1fcaa9842c2e980c9f140": "SetReservePool · SPCX",
  "0xff01c5bdb1e2580ea131fad6c5d2fd6c3f6384ef": "SetReservePool · AAPL",
  "0xe55531ba052c04e516d67f05d9aa9479de02e2af": "SetReservePool · SPY",

  // Superseded first-generation candidates. Never vote for these: they
  // seat the v1 Quivers.
  "0x686a9288f79b3a6fbf32c244dffd81ad3266d52f": "AddPool · NVDA (superseded, do not enact)",
  "0x6e62a19940acdb87e82f2477b5e9539776f5df8d": "AddPool · SPCX (superseded, do not enact)",
  "0xd192c34560b69f1376feaa5942eec72d3a830352": "AddPool · AAPL (superseded, do not enact)",
  "0xe58b7c91e58e861bcd41bb50d46e1a1e56852fba": "AddPool · SPY (superseded, do not enact)",
};

export function candidateLabel(address: Address | string): string | undefined {
  return CANDIDATE_LABELS[address.toLowerCase()];
}
