// ============================================================
// CAMEL Phase 1 WL Mint Config
// Fill in the values once tier data is published
// ============================================================

export const CONFIG = {
  // CAMEL contract address on Ethereum mainnet
  // TODO: Fill in once deployed (check etherscan after launch)
  CAMEL_ADDRESS: "0x0000000000000000000000000000000000000000",

  // Your wallet private key (keep this secret!)
  PRIVATE_KEY: "0x_your_private_key_here",

  // RPC endpoint (Alchemy recommended for mainnet)
  RPC_URL: "https://eth-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY",

  // ============================================================
  // TIER DATA — fill these from the published tier JSON files
  // They drop at: /data/camel-tier-0-<hash>.js and camel-tier-1-<hash>.js
  // ============================================================
  TIER: {
    // Merkle root from the tier JSON file
    merkleRoot: "0x_your_merkle_root_from_tier_data",

    // Your slot number (0 = tier 0, 1 = tier 1)
    slot: 1,

    // Whitelist addresses from tier data
    whitelistAddresses: [
      // "0x..."
    ],
  },
};
