# CAMEL Phase 1 WL Mint Script

## Setup

```bash
cd /path/to/camel-mint
npm install
```

## Configure

Edit `src/config.ts`:

```typescript
export const CONFIG = {
  CAMEL_ADDRESS: "0x...",      // CAMEL contract address (from launch)
  PRIVATE_KEY: "0x...",         // Your wallet PK
  RPC_URL: "https://...",       // Alchemy mainnet URL

  TIER: {
    merkleRoot: "0x...",       // From tier JSON file
    slot: 1,                    // Your tier slot
    whitelistAddresses: [...]   // Full list from tier JSON
  }
}
```

## Run

```bash
npx ts-node src/mint.ts
```

## Getting Tier Data

The tier data files drop at:
- `/data/camel-tier-0-<hash>.js`
- `/data/camel-tier-1-<hash>.js`

They contain:
- `merkleRoot` — the root for proof verification
- `whitelistAddresses` — sorted array of WL addresses
- Each address maps to a slot based on its position

Check the site or their Twitter/X for the tier data drop announcement.

##⚠️ Disclaimer

This script interacts with real Ethereum mainnet contracts. Use at your own risk. Always verify the contract address and logic before sending transactions.
