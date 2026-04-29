// ============================================================
// CAMEL Phase 1 WL Mint Script — Multi-wallet, Parallel, Auto-fetch
// ============================================================
// 1. npm install
// 2. Fill in RPC_URL and PRIVATE_KEYS in config.ts
// 3. npx ts-node src/mint.ts
// ============================================================

import { ethers } from "ethers";
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

  const bundleUrl = "https://camelcabal.fun/assets/index-8254a56c.js";
  let bundleText = "";

  try {
    const res = await fetch(bundleUrl);
    if (res.ok) bundleText = await res.text();
  } catch {}

  // Find tier file names in bundle
  const tierFiles: string[] = [];
  const tierMatches = bundleText.matchAll(/camel-tier-(\d)-([a-f0-9]{8})\.js/g);
  for (const m of tierMatches) {
    tierFiles.push(`camel-tier-${m[1]}-${m[2]}.js`);
  }

  const candidates: string[] = [
    ...tierFiles.map((f) => `https://camelcabal.fun/data/${f}`),
    "https://camelcabal.fun/data/camel-tier-0-20691f5a.js",
    "https://camelcabal.fun/data/camel-tier-1-15e48e54.js",
  ];

  let lastError = "";
  for (const url of candidates) {
    try {
      console.log(`   Trying: ${url.split("/").pop()}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const text = await res.text();

      // Extract merkleRoot — supports: merkleRoot = "0x...", export const merkleRoot = "0x..."
      const merkleMatch = text.match(/merkleRoot\s*=\s*"0x([a-fA-F0-9]{64})"/);
      const addressesMatch = text.match(/whitelistAddresses\s*=\s*\[([\s\S]*?)\]/);

      if (!merkleMatch) throw new Error("merkleRoot not found");
      if (!addressesMatch) throw new Error("whitelistAddresses not found");

      const merkleRoot = "0x" + merkleMatch[1];

      // Parse addresses — supports: "0x...", '0x...'
      const addrRegex = /["']0x([a-fA-F0-9]{40})["']/g;
      const addresses: string[] = [];
      let m;
      while ((m = addrRegex.exec(addressesMatch[1])) !== null) {
        addresses.push("0x" + m[1].toLowerCase());
      }

      if (addresses.length === 0) throw new Error("No addresses parsed");

      console.log(`   ✅ Found ${addresses.length} WL addresses`);
      console.log(`   ✅ Root: ${merkleRoot.slice(0, 18)}...`);
      return { merkleRoot, whitelistAddresses: addresses };
    } catch (err: any) {
      lastError = err.message;
      continue;
    }
  }

  throw new Error(
    `Tier data not available (all URLs returned 404).\n` +
    `   The whitelist hasn't been published yet.\n` +
    `   Check https://camelcabal.fun for updates.`
  );
}

// ============================================================
// Merkle Proof Builder
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

  type Node = { hash: Buffer; left?: Node; right?: Node };

  // Build leaves
  const leaves: Node[] = sortedAddresses.map((a) => ({
    hash: Buffer.from(
      ethers.keccak256(Buffer.from(a.slice(2), "hex")).slice(2),
      "hex"
    ),
  }));

  // Pad to power of 2 (required for complete binary tree)
  let size = 1;
  while (size < leaves.length) size *= 2;
  while (leaves.length < size) {
    // Pad with last leaf for uneven trees (standard merkle padding)
    leaves.push({ hash: leaves[leaves.length - 1].hash });
  }

  // Build tree bottom-up
  const layers: Node[][] = [leaves];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next: Node[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      const left = prev[i];
      const right = prev[i + 1] ?? { hash: left.hash };
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

  // Trace from leaf to root collecting siblings
  let current: Node | undefined = leaves[slot];
  const proof: Buffer[] = [];

  while (current?.parent) {
    const isRight = current.parent.right === current;
    const sibling = isRight ? current.parent.left : current.parent.right;
    if (sibling) proof.push(sibling.hash);
    current = current.parent;
  }

  return {
    proof: proof.map((b) => bufferToHex(b)),
    slot,
  };
}

// ============================================================
// Gas helper
// ============================================================
interface GasSettings {
  maxFeePerGas: bigint | null;
  maxPriorityFeePerGas: bigint | null;
  gasLimit: number;
}

async function getGasSettings(
  provider: ethers.JsonRpcProvider
): Promise<GasSettings> {
  const limit = CONFIG.GAS_LIMIT;

  if (CONFIG.MAX_FEE_PER_GAS !== null && CONFIG.MAX_PRIORITY_FEE_PER_GAS !== null) {
    const f = BigInt(CONFIG.MAX_FEE_PER_GAS) * BigInt(1e9);
    const p = BigInt(CONFIG.MAX_PRIORITY_FEE_PER_GAS) * BigInt(1e9);
    console.log(`   ⛽ Using manual gas: maxFee=${CONFIG.MAX_FEE_PER_GAS} gwei, priorityFee=${CONFIG.MAX_PRIORITY_FEE_PER_GAS} gwei`);
    return { maxFeePerGas: f, maxPriorityFeePerGas: p, gasLimit: limit };
  }

  // Auto mode
  const feeData = await provider.getFeeData();
  const maxFee = feeData.maxFeePerGas ?? (await provider.getGasPrice());
  const maxPri = feeData.maxPriorityFeePerGas ?? BigInt(1e9);

  const maxFeeGwei = Number(maxFee / BigInt(1e9));
  const maxPriGwei = Number(maxPri / BigInt(1e9));
  console.log(`   ⛽ Using auto gas: maxFee=${maxFeeGwei} gwei, priorityFee=${maxPriGwei} gwei`);

  return { maxFeePerGas: maxFee, maxPriorityFeePerGas: maxPri, gasLimit: limit };
}

// ============================================================
// Per-wallet mint (runs in parallel)
// ============================================================
async function mintForWallet(
  wallet: ethers.Wallet,
  tierData: TierData,
  camel: ethers.Contract,
  gasSettings: GasSettings
): Promise<{ address: string; success: boolean; reason?: string; txHash?: string }> {
  const address = wallet.address.toLowerCase();
  const short = address.slice(0, 6) + "..." + address.slice(-4);

  try {
    // 1. Check claimed
    const hasClaimed = await camel.claimed(address);
    if (hasClaimed) {
      return { address, success: true, reason: "already_claimed" };
    }

    // 2. Check WL mint live
    const mintLive = await camel.whitelistMintLive();
    if (!mintLive) {
      return { address, success: false, reason: "mint_not_live" };
    }

    // 3. Build Merkle proof
    const { proof, slot } = buildMerkleProof(address, tierData.whitelistAddresses);

    // 4. Send mint tx with custom gas
    const overrides: ethers.TransactionRequest = {
      gasLimit: BigInt(gasSettings.gasLimit),
    };
    if (gasSettings.maxFeePerGas !== null) {
      overrides.maxFeePerGas = gasSettings.maxFeePerGas;
    }
    if (gasSettings.maxPriorityFeePerGas !== null) {
      overrides.maxPriorityFeePerGas = gasSettings.maxPriorityFeePerGas;
    }

    const tx = await (camel.connect(wallet) as any).whitelistMint(
      proof,
      slot,
      overrides
    );

    const receipt = await tx.wait();

    if (receipt?.status === 1) {
      return { address, success: true, txHash: tx.hash };
    } else {
      return { address, success: false, reason: "tx_failed" };
    }
  } catch (err: any) {
    const reason = err.reason || err.message || String(err);
    if (reason.includes("not in whitelist")) {
      return { address, success: false, reason: "not_whitelisted" };
    }
    return { address, success: false, reason: reason.slice(0, 120) };
  }
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log("\n🐪 CAMEL Phase 1 WL Mint — Parallel Multi-Wallet");
  console.log("================================================\n");

  // Validate config
  if (!CONFIG.RPC_URL || CONFIG.RPC_URL.includes("YOUR_ALCHEMY_KEY")) {
    console.error("❌  CONFIG.RPC_URL not set in config.ts");
    process.exit(1);
  }
  if (!CONFIG.PRIVATE_KEYS || CONFIG.PRIVATE_KEYS.length === 0) {
    console.error("❌  No PRIVATE_KEYS in config.ts");
    process.exit(1);
  }
  if (CONFIG.PRIVATE_KEYS.some((k) => k.includes("_private_key"))) {
    console.error("❌  Replace placeholder private keys in config.ts");
    process.exit(1);
  }

  // Init provider + derive wallets
  const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);

  console.log("🔑 Wallets:");
  const wallets: ethers.Wallet[] = [];
  for (const pk of CONFIG.PRIVATE_KEYS) {
    const w = new ethers.Wallet(pk, provider);
    console.log(`   ${w.address}`);
    wallets.push(w);
  }
  console.log();

  // Fetch tier data once
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
    try {
      const bundle = await fetch(
        "https://camelcabal.fun/assets/index-8254a56c.js"
      ).then((r) => r.text());
      const match =
        bundle.match(/camel\s*:\s*e\.[a-zA-Z0-9_$]+\|\|"(0x[a-fA-F0-9]{40})"/) ??
        bundle.match(/"camel"\s*:\s*"(0x[a-fA-F0-9]{40})"/);
      if (match) camelAddress = match[1];
    } catch {}
  }

  if (!camelAddress) {
    console.error(
      "\n❌ Could not resolve CAMEL contract address.\n" +
      "   Set CONFIG.CAMEL_ADDRESS manually in config.ts."
    );
    process.exit(1);
  }
  console.log(`   ✅ CAMEL: ${camelAddress}\n`);

  // Get gas settings once
  const gasSettings = await getGasSettings(provider);
  console.log();

  // ============================================================
  // ALL WALLETS FIRE IN PARALLEL
  // ============================================================
  console.log("🚀 Firing all wallets in parallel...\n");

  const camel = (address: string) =>
    new ethers.Contract(address, CAMEL_ABI, provider);

  const results = await Promise.all(
    wallets.map((w) => mintForWallet(w, tierData, camel(camelAddress), gasSettings))
  );

  // ============================================================
  // Summary
  // ============================================================
  console.log("\n" + "=".repeat(52));
  console.log("📊 RESULTS");
  console.log("=".repeat(52));

  let claimed = 0, skipped = 0, failed = 0, notWL = 0, notLive = 0;

  for (const r of results) {
    const short = r.address.slice(0, 6) + "..." + r.address.slice(-4);
    if (r.success) {
      if (r.reason === "already_claimed") {
        console.log(`   ⏭️  ${short} — already claimed`);
        skipped++;
      } else {
        console.log(`   ✅ ${short} — minted! (tx: ${r.txHash?.slice(0, 10)}...)`);
        claimed++;
      }
    } else if (r.reason === "not_whitelisted") {
      console.log(`   🚫 ${short} — not on WL`);
      notWL++;
    } else if (r.reason === "mint_not_live") {
      console.log(`   ⏳ ${short} — mint not live yet`);
      notLive++;
    } else {
      console.log(`   ❌ ${short} — ${r.reason}`);
      failed++;
    }
  }

  console.log(
    `\n   Claimed: ${claimed} | Already-claimed: ${skipped} | Not-WL: ${notWL} | Not-live: ${notLive} | Failed: ${failed}`
  );
  console.log("\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
