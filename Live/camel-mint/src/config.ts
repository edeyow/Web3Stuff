// ============================================================
// CAMEL Phase 1 WL Mint Config
// Only RPC + private keys needed. Everything else is auto-fetched.
// ============================================================

export const CONFIG = {
  // Alchemy mainnet URL
  RPC_URL: "https://eth-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY",

  // Comma-separated private keys (or array of hex strings)
  // Supports multiple wallets — each will be checked against WL
  PRIVATE_KEYS: [
    "0x_your_private_key_1",
    "0x_your_private_key_2",
    // add more keys here...
  ],

  // CAMEL contract address (auto-fetched from source if not set)
  CAMEL_ADDRESS: "",

  // Auto-fetch tier data from camelcabal.fun (only works after tier drop)
  TIER_FETCH_URL: "https://camelcabal.fun/data/",

  // Gas settings (leave auto for now)
  GAS_LIMIT: 200000,
};
