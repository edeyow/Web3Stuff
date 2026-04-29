// ============================================================
// CAMEL Phase 1 WL Mint Config
// Only RPC + private keys needed. Everything else is auto-fetched.
// ============================================================

export const CONFIG = {
  // Alchemy mainnet URL
  RPC_URL: "https://eth-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY",

  // Comma-separated private keys (or array of hex strings)
  // All wallets execute in PARALLEL — no wallet gets favored
  PRIVATE_KEYS: [
    "0x_your_private_key_1",
    "0x_your_private_key_2",
    // add more keys here...
  ],

  // CAMEL contract address (auto-fetched if not set)
  CAMEL_ADDRESS: "",

  // Auto-fetch tier data from camelcabal.fun
  TIER_FETCH_URL: "https://camelcabal.fun/data/",

  // Gas settings — set to null for auto (recommended)
  MAX_FEE_PER_GAS: null,   // in gwei, e.g. 50 = 50 gwei
  MAX_PRIORITY_FEE_PER_GAS: null, // in gwei, e.g. 2 = 2 gwei
  GAS_LIMIT: 200000,
};
