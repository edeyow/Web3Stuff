// ============================================================
// CAMEL Phase 1 WL Mint Script — Multi-wallet, Auto-fetch tier
// ============================================================
// 1. npm install
// 2. Fill in RPC_URL and PRIVATE_KEYS in config.ts
// 3. npx ts-node src/mint.ts
// ============================================================

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { CONFIG } from "./config";

const CAMEL_ABI = [
  "function claimed(address) view returns (bool)",
  "function whitelistMintLive() view returns (bool)",
  "function whitelistMint(address[] proof, uint256 slot) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
];

// ============================================================
// Tier data fetcher
// ============================================================
interface TierData {
  merkleRoot: string;
  whitelistAddresses: string[];
}

async function fetchTierData(): Promise<TierData> {
  console.log("🌐 Fetching tier data from camelcabal.fun...");

  // First, get the JS bundle to find the current tier file hashes
  const bundleUrl = `${CONFIG.TIER_FETCH_URL.startsWith("https") ? "" : "https://camelcabal.fun"}/assets/index-8254a56c.js`;
  console.log("  Fetching bundle to locate tier file hashes...");

  let bundleText: string;
  try {
    const response = await fetch(bundleUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    bundleText = await response.text();
  } catch (err: any) {
    // Try alternate approach: just try known file patterns directly
    console.log("   Bundle fetch failed, trying direct tier file URLs...");
    bundleText = "";
  }

  // Try to find tier file names in bundle
  const tierMatch = bundleText.match(/camel-tier-(\d)-([a-f0-9]{8})\.js/);
  const tierFile = tierMatch
    ? `camel-tier-${tierMatch[1]}-${tierMatch[2]}.js`
    : null;

  // Try multiple possible URLs
  const candidates = tierFile
    ? [
        `https://camelcabal.fun/data/${tierFile}`,
        `https://camelcabal.fun/${tierFile}`,
      ]
    : [
        // Fallback patterns until tier data drops
        `https://camelcabal.fun/data/camel-tier-0-20691f5a.js`,
        `https://camelcabal.fun/data/camel-tier-1-15e48e54.js`,
      ];

  let lastError: Error | null = null;
  for (const url of candidates) {
    try {
      console.log(`   Trying: ${url}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const text = await res.text();

      // Extract from JS module format: export const merkleRoot = "0x..."
      // or: const merkleRoot = "0x..."
      const merkleMatch = text.match(/merkleRoot\s*=\s*"0x[a-fA-F0-9]{64}"/);
      const addressesMatch = text.match(/whitelistAddresses\s*=\s*\[([^\]]+)\]/);

      if (!merkleMatch) throw new Error("Could not find merkleRoot in tier file");
      if (!addressesMatch) throw new Error("Could not find whitelistAddresses in tier file");

      const merkleRoot = merkleMatch[0].match(/"0x[a-fA-F0-9]{64}"/)?.[0]?.replace(/"/g, "") || "";

      // Parse addresses — they might be in various formats
      const addrStr = addressesMatch[1];
      const addresses: string[] = [];
      const addrRegex = /"0x[a-fA-F0-9]{40}"/g;
      let m;
      while ((m = addrRegex.exec(addrStr)) !== null) {
        addresses.push(m[0].replace(/"/g, "").toLowerCase());
      }

      if (addresses.length === 0) {
        throw new Error("No addresses parsed from whitelistAddresses");
      }

      console.log(`   ✅ Found ${addresses.length} WL addresses`);
      console.log(`   ✅ Merkle root: ${merkleRoot.slice(0, 18)}...`);

      return { merkleRoot, whitelistAddresses: addresses };
    } catch (err: any) {
      lastError = err;
      continue;
    }
  }

  throw new Error(
    `Tier data not available yet. The whitelist hasn't been published.\n` +
    `   Last error: ${lastError?.message}\n` +
    `   Check https://camelcabal.fun for the tier data drop.`
  );
}

// ============================================================
// Merkle Tree — handles uneven trees (power-of-2 padding)
// ============================================================
function bufferToHex(buf: Buffer): string {
  return "0x" + buf.toString("hex");
}

function buildMerkleProof(
  address: string,
  sortedAddresses: string[]
): { proof: string[]; slot: number } {
  const addr = address.toLowerCase();
  const slot = sortedAddresses.indexOf(addr);
  if (slot === -1) {
    throw new Error(`Address ${addr} not in whitelist`);
  }

  // Build layers
  type Node = { hash: Buffer; left?: Node; right?: Node };
  const leaves: Node[] = sortedAddresses.map((a) => ({
    hash: Buffer.from(ethers.keccak256(Buffer.from(a.slice(2), "hex")).slice(2), "hex"),
  }));

  // Pad to power of 2
  let size = 1;
  while (size < leaves.length) size *= 2;

  // Pad last leaf for uneven trees
  while (leaves.length < size) {
    leaves.push({ hash: leaves[leaves.length - 1].hash });
  }

  const layers: Node[][] = [leaves];

  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next: Node[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      const left = prev[i];
      const right = prev[i + 1] || { hash: prev[i].hash }; // pad with self for uneven
      const concat = Buffer.concat(
        [left.hash, right.hash].sort((a, b) => a.compare(b))
      );
      const parent: Node = {
        hash: Buffer.from(ethers.keccak256(concat).slice(2), "hex"),
        left,
        right,
      };
      left.parent = parent;
      right.parent = parent;
      next.push(parent);
    }
    layers.push(next);
  }

  const root = layers[layers.length - 1][0];

  // Generate proof for our slot
  let current: Node | undefined = leaves[slot];
  const proof: Buffer[] = [];

  while (current?.parent) {
    const isRight = current.parent.right === current;
    const sibling = isRight ? current.parent.left : current.parent.right;
    if (sibling) {
      proof.push(sibling.hash);
    }
    current = current.parent;
  }

  return {
    proof: proof.map((b) => bufferToHex(b)),
    slot,
  };
}

// ============================================================
// Per-wallet mint
// ============================================================
async function mintForWallet(
  wallet: ethers.Wallet,
  tierData: TierData,
  camel: ethers.Contract
): Promise<{ success: boolean; reason?: string }> {
  const address = wallet.address.toLowerCase();

  console.log(`\n${"=".repeat(50)}`);
  console.log(`📪 Wallet: ${address}`);
  console.log("=".repeat(50));

  // 1. Check if already claimed
  try {
    const hasClaimed = await camel.claimed(address);
    if (hasClaimed) {
      console.log("   ⏭️  Already claimed. Skipping.");
      return { success: true, reason: "already_claimed" };
    }
  } catch (err: any) {
    return { success: false, reason: `claimed() call failed: ${err.message}` };
  }

  // 2. Check if WL mint is live
  let mintLive = false;
  try {
    mintLive = await camel.whitelistMintLive();
    if (!mintLive) {
      console.log("   ⏳ Whitelist mint not live yet. Check back at tier1OpensAt.");
      return { success: false, reason: "mint_not_live" };
    }
    console.log("   ✅ WL mint is LIVE");
  } catch (err: any) {
    return { success: false, reason: `whitelistMintLive() failed: ${err.message}` };
  }

  // 3. Build Merkle proof
  let proofData: { proof: string[]; slot: number };
  try {
    proofData = buildMerkleProof(address, tierData.whitelistAddresses);
    console.log(`   ✅ Slot: ${proofData.slot}`);
    console.log(`   ✅ Proof nodes: ${proofData.proof.length}`);
  } catch (err: any) {
    if (err.message.includes("not in whitelist")) {
      console.log("   ❌ NOT on whitelist. Skipping.");
      return { success: false, reason: "not_whitelisted" };
    }
    return { success: false, reason: `Merkle proof failed: ${err.message}` };
  }

  // 4. Send mint tx
  console.log("   📡 Sending whitelistMint transaction...");
  try {
    const tx = await camel.whitelistMint(proofData.proof, proofData.slot, {
      gasLimit: CONFIG.GAS_LIMIT,
    });
    console.log(`   ⏳ Tx: ${tx.hash}`);
    console.log(`   ⏳ Waiting for confirmation...`);

    const receipt = await tx.wait();

    if (receipt?.status === 1) {
      const newBalance = await camel.balanceOf(address);
      console.log(`   ✅ SUCCESS!`);
      console.log(`   New CAMEL balance: ${ethers.formatUnits(newBalance, 18)}`);
      return { success: true };
    } else {
      return { success: false, reason: "tx_failed" };
    }
  } catch (err: any) {
    const reason = err.reason || err.message || String(err);
    console.log(`   ❌ Mint failed: ${reason}`);
    return { success: false, reason };
  }
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log("\n🐪 CAMEL Phase 1 WL Mint — Multi-Wallet");
  console.log("========================================\n");

  // Validate config
  if (!CONFIG.RPC_URL || CONFIG.RPC_URL.includes("YOUR_ALCHEMY_KEY")) {
    console.error("❌  CONFIG.RPC_URL not set in config.ts");
    process.exit(1);
  }

  if (!CONFIG.PRIVATE_KEYS || CONFIG.PRIVATE_KEYS.length === 0) {
    console.error("❌  No PRIVATE_KEYS set in config.ts");
    process.exit(1);
  }

  if (CONFIG.PRIVATE_KEYS.some((k) => k === "0x_your_private_key_1")) {
    console.error("❌  Replace the placeholder private key in config.ts");
    process.exit(1);
  }

  // Init provider
  const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);

  // Derive addresses first
  console.log("🔑 Derived addresses:");
  const wallets: ethers.Wallet[] = [];
  for (const pk of CONFIG.PRIVATE_KEYS) {
    try {
      const w = new ethers.Wallet(pk, provider);
      console.log(`   ${w.address}`);
      wallets.push(w);
    } catch (err: any) {
      console.error(`   ❌ Invalid PK: ${err.message}`);
      process.exit(1);
    }
  }

  // Fetch tier data (auto from site)
  let tierData: TierData;
  try {
    tierData = await fetchTierData();
  } catch (err: any) {
    console.error(`\n❌ ${err.message}`);
    process.exit(1);
  }

  // Resolve CAMEL contract address
  let camelAddress = CONFIG.CAMEL_ADDRESS;
  if (!camelAddress) {
    // Try to extract from bundle
    console.log("\n🔍 Resolving CAMEL contract address from source...");
    try {
      const bundle = await fetch(
        "https://camelcabal.fun/assets/index-8254a56c.js"
      ).then((r) => r.text());

      const match = bundle.match(/camel\s*:\s*e\.([a-zA-Z0-9_$]+)\|\|"(0x[a-fA-F0-9]{40})"/);
      if (match) {
        camelAddress = match[2];
      } else {
        // Try another pattern
        const addrMatch = bundle.match(/"camel"\s*:\s*"(0x[a-fA-F0-9]{40})"/);
        if (addrMatch) camelAddress = addrMatch[1];
      }
    } catch {}
  }

  if (!camelAddress) {
    console.error(
      "\n❌ Could not resolve CAMEL contract address.\n" +
      "   Set CONFIG.CAMEL_ADDRESS manually in config.ts."
    );
    process.exit(1);
  }
  console.log(`   ✅ CAMEL contract: ${camelAddress}`);

  // ============================================================
  // Process each wallet
  // ============================================================
  const results: Record<
    string,
    { success: boolean; reason?: string }
  > = {};

  for (const wallet of wallets) {
    const camel = new ethers.Contract(camelAddress, CAMEL_ABI, wallet);
    results[wallet.address] = await mintForWallet(wallet, tierData, camel);

    // Small delay between txs to avoid nonce conflicts
    if (wallet !== wallets[wallets.length - 1]) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // ============================================================
  // Summary
  // ============================================================
  console.log("\n\n" + "=".repeat(50));
  console.log("📊 RESULTS");
  console.log("=".repeat(50));

  let claimed = 0,
    skipped = 0,
    failed = 0,
    notWL = 0;

  for (const [addr, result] of Object.entries(results)) {
    const short = addr.slice(0, 6) + "..." + addr.slice(-4);
    if (result.success) {
      if (result.reason === "already_claimed") {
        console.log(`   ⏭️  ${short} — already claimed`);
        skipped++;
      } else {
        console.log(`   ✅ ${short} — minted!`);
        claimed++;
      }
    } else if (result.reason === "not_whitelisted") {
      console.log(`   🚫 ${short} — not on WL`);
      notWL++;
    } else {
      console.log(`   ❌ ${short} — ${result.reason}`);
      failed++;
    }
  }

  console.log(`\n   Claimed: ${claimed} | Already-claimed: ${skipped} | Not-WL: ${notWL} | Failed: ${failed}`);
  console.log("\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
