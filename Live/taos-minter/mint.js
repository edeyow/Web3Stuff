import "dotenv/config";
import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ──────────────────────────────────────────────────
const RPC = "wss://entrypoint-finney.opentensor.ai:443";
const TREASURY = "5Fh7dSmMKVXT5YC7hsfCcHDg171xtQWBhppu66pxCqbvnnJC";
const PLATFORM_FEE = 1_000_000; // 0.001 TAO in rao

const SEED = process.env.SEED_PHRASE?.trim();
const KEYSTORE_FILE = process.env.KEYSTORE_FILE?.trim();
const KEYSTORE_PASSWORD = process.env.KEYSTORE_PASSWORD || "";
const MINT_COUNT = parseInt(process.env.MINT_COUNT || "1", 10);
const DELAY_MS = parseInt(process.env.DELAY_MS || "15000", 10);
const TICK = (process.env.TICK || "TAOS").toUpperCase();
const AMOUNT = process.env.AMOUNT || "420";

if (!SEED && !KEYSTORE_FILE) {
  console.error("❌ Set either SEED_PHRASE or KEYSTORE_FILE + KEYSTORE_PASSWORD in .env");
  process.exit(1);
}

// ── Helpers ─────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ts() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function sendBatch(api, account, remarkHex) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("tx timeout 60s")), 60000);
    const transfer = api.tx.balances.transferKeepAlive(TREASURY, PLATFORM_FEE);
    const remark = api.tx.system.remark(remarkHex);
    const batch = api.tx.utility.batchAll([transfer, remark]);

    let unsub;
    let resolved = false;

    batch
      .signAndSend(account, (result) => {
        if (resolved) return;
        if (result.status.isInBlock) {
          resolved = true;
          clearTimeout(timeout);
          const blockHash = result.status.asInBlock.toHex();
          resolve({ blockHash, txHash: result.txHash.toHex() });
          try { if (unsub) unsub(); } catch {}
        } else if (result.isError || result.dispatchError) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error(result.dispatchError?.toString() || "tx error"));
          try { if (unsub) unsub(); } catch {}
        }
      })
      .then((u) => { unsub = u; })
      .catch((e) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(e);
        }
      });
  });
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  console.log("╔═══════════════════════════════════════╗");
  console.log("║       TAOS Inscription Minter         ║");
  console.log("╠═══════════════════════════════════════╣");
  console.log(`║  Token: ${TICK.padEnd(29)}║`);
  console.log(`║  Amount/mint: ${AMOUNT.padEnd(24)}║`);
  console.log(`║  Mints: ${String(MINT_COUNT).padEnd(29)}║`);
  console.log(`║  Delay: ${(DELAY_MS + "ms").padEnd(29)}║`);
  console.log(`║  Total TAOS: ${String(MINT_COUNT * parseInt(AMOUNT)).padEnd(24)}║`);
  console.log(`║  Total cost: ~${(MINT_COUNT * 0.0011).toFixed(4) + " TAO"} ${" ".repeat(17)}║`);
  console.log("╚═══════════════════════════════════════╝\n");

  // Connect to Bittensor
  console.log(`[${ts()}] Connecting to Bittensor Finney...`);
  const provider = new WsProvider(RPC);
  const api = await ApiPromise.create({ provider });
  const chain = await api.rpc.system.chain();
  console.log(`[${ts()}] Connected to ${chain}\n`);

  // Setup account from seed or JSON keystore
  const keyring = new Keyring({ type: "sr25519" });
  let account;

  if (KEYSTORE_FILE) {
    const jsonPath = resolve(__dirname, KEYSTORE_FILE);
    const json = JSON.parse(readFileSync(jsonPath, "utf8"));
    account = keyring.addFromJson(json);
    account.decodePkcs8(KEYSTORE_PASSWORD);
    console.log(`[${ts()}] Loaded from keystore: ${KEYSTORE_FILE}`);
  } else {
    account = keyring.addFromUri(SEED);
    console.log(`[${ts()}] Loaded from seed phrase`);
  }
  console.log(`[${ts()}] Wallet: ${account.address}`);

  // Check balance
  const { data: balance } = await api.query.system.account(account.address);
  const freeBalance = parseFloat(balance.free.toString()) / 1e9;
  const totalCost = MINT_COUNT * 0.0011;
  console.log(`[${ts()}] Balance: ${freeBalance.toFixed(4)} TAO`);
  console.log(
    `[${ts()}] Estimated cost: ${totalCost.toFixed(4)} TAO (${MINT_COUNT} mints)\n`
  );

  if (freeBalance < totalCost) {
    console.error(
      `❌ Insufficient balance. Need ~${totalCost.toFixed(4)} TAO, have ${freeBalance.toFixed(4)} TAO`
    );
    await api.disconnect();
    process.exit(1);
  }

  // Build the inscription remark
  const inscription = JSON.stringify({
    p: "tao-20",
    op: "mint",
    tick: TICK,
    amt: AMOUNT,
  });
  const remarkHex = "0x" + Buffer.from(inscription, "utf8").toString("hex");

  console.log(`[${ts()}] Inscription: ${inscription}`);
  console.log(`[${ts()}] Remark hex: ${remarkHex.slice(0, 40)}...\n`);

  // Mint loop
  const results = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < MINT_COUNT; i++) {
    const num = `[${i + 1}/${MINT_COUNT}]`;
    process.stdout.write(`[${ts()}] ${num} Minting... `);

    try {
      const { blockHash, txHash } = await sendBatch(api, account, remarkHex);
      succeeded++;
      console.log(`✓ block: ${blockHash.slice(0, 14)}... tx: ${txHash.slice(0, 14)}...`);
      results.push({ mint: i + 1, success: true, blockHash, txHash });
    } catch (e) {
      failed++;
      console.log(`✗ ${e.message}`);
      results.push({ mint: i + 1, success: false, error: e.message });
    }

    // Delay between mints
    if (i < MINT_COUNT - 1) {
      await sleep(DELAY_MS);
    }
  }

  // Summary
  console.log("\n═══════════════════════════════════════");
  console.log(` ✅ ${succeeded} minted  ❌ ${failed} failed`);
  console.log(` 📦 Total: ${succeeded * parseInt(AMOUNT)} ${TICK}`);
  console.log("═══════════════════════════════════════\n");

  // Check final balance
  const { data: finalBal } = await api.query.system.account(account.address);
  const finalFree = parseFloat(finalBal.free.toString()) / 1e9;
  console.log(
    `[${ts()}] Balance: ${freeBalance.toFixed(4)} → ${finalFree.toFixed(4)} TAO (spent: ${(freeBalance - finalFree).toFixed(4)} TAO)`
  );

  await api.disconnect();
  console.log(`[${ts()}] Done.`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
