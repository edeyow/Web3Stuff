// ============================================================
// CAMEL Phase 1 WL Mint Script
// ============================================================
// 1. npm install
// 2. Fill in config.ts (contract address, tier data, private key)
// 3. npx ts-node src/mint.ts
// ============================================================

import { ethers } from "ethers";
import { CONFIG } from "./config";
import { buildMerkleProof } from "./merkle";

// ============================================================
// ABI — only what we need for WL mint
// ============================================================
const CAMEL_ABI = [
  // Check if address has claimed
  "function claimed(address) view returns (bool)",
  // Check if mint is live
  "function whitelistMintLive() view returns (bool)",
  // The WL mint function
  "function whitelistMint(address[] proof, uint256 slot) returns (bool)",
  // Optionally: check your balance / supply
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
];

async function main() {
  console.log("\n========================================");
  console.log(" CAMEL Phase 1 WL Mint");
  console.log("========================================\n");

  // ============================================================
  // Validation
  // ============================================================
  if (!CONFIG.CAMEL_ADDRESS || CONFIG.CAMEL_ADDRESS === "0x0000000000000000000000000000000000000000") {
    console.error("❌  CONFIG.CAMEL_ADDRESS not set. Check config.ts");
    process.exit(1);
  }

  if (CONFIG.PRIVATE_KEY === "0x_your_private_key_here") {
    console.error("❌  CONFIG.PRIVATE_KEY not set. Check config.ts");
    process.exit(1);
  }

  if (!CONFIG.RPC_URL || CONFIG.RPC_URL.includes("YOUR_ALCHEMY_KEY")) {
    console.error("❌  CONFIG.RPC_URL not set. Check config.ts");
    process.exit(1);
  }

  if (!CONFIG.TIER.merkleRoot || CONFIG.TIER.merkleRoot === "0x_your_merkle_root_from_tier_data") {
    console.error("❌  CONFIG.TIER not populated. Fill in config.ts with tier data.");
    process.exit(1);
  }

  // ============================================================
  // Setup provider + wallet
  // ============================================================
  const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
  const wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
  const address = wallet.address;
  const camel = new ethers.Contract(CONFIG.CAMEL_ADDRESS, CAMEL_ABI, wallet);

  console.log(`📪 Connected wallet: ${address}`);

  // ============================================================
  // Pre-flight checks
  // ============================================================
  console.log("\n🔍 Pre-flight checks...\n");

  // 1. Already claimed?
  const hasClaimed = await camel.claimed(address);
  if (hasClaimed) {
    console.log("❌ Already claimed. Cannot mint again.");
    process.exit(1);
  }
  console.log("   ✓ Not yet claimed");

  // 2. WL mint live?
  const mintLive = await camel.whitelistMintLive().catch(() => false);
  if (!mintLive) {
    console.log("❌ Whitelist mint is not live yet. Wait for tier1OpensAt.");
    process.exit(1);
  }
  console.log("   ✓ Whitelist mint is live");

  // 3. Check balance before
  const balanceBefore = await camel.balanceOf(address);
  console.log(`   ✓ Current CAMEL balance: ${ethers.formatUnits(balanceBefore, 18)}`);

  // ============================================================
  // Build Merkle proof
  // ============================================================
  console.log("\n🌳 Building Merkle proof...\n");

  const { proof, slot } = buildMerkleProof(
    address,
    CONFIG.TIER.whitelistAddresses
  );

  if (slot === -1) {
    console.error("❌ Your address is NOT in the whitelist. Cannot mint.");
    process.exit(1);
  }

  console.log(`   ✓ Your slot: ${slot}`);
  console.log(`   ✓ Proof length: ${proof.length} nodes`);

  // ============================================================
  // Send mint tx
  // ============================================================
  console.log("\n📡 Submitting whitelistMint transaction...\n");

  try {
    const tx = await camel.whitelistMint(proof, slot, {
      gasLimit: 200000, // should be enough for WL mint
    });

    console.log(`   ⏳ Tx submitted: ${tx.hash}`);
    console.log(`   ⏳ Waiting for confirmation...`);

    const receipt = await tx.wait();

    if (receipt?.status === 1) {
      console.log("\n✅ MINT SUCCESSFUL!");
      const balanceAfter = await camel.balanceOf(address);
      console.log(`   New CAMEL balance: ${ethers.formatUnits(balanceAfter, 18)}`);
    } else {
      console.error("\n❌ Transaction failed.");
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`\n❌ Mint failed: ${err.reason || err.message || err}`);
    process.exit(1);
  }
}

main();
