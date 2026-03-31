/**
 * TMM Bulk Wallet Registration
 * 
 * Generates N wallets, for each:
 * 1. SIWE auth with referral code
 * 2. Complete tournament (7 matches)
 * 3. Complete all tasks (AdFather)
 * 
 * Usage:
 *   node tmm-bulk.mjs [count] [referral_code]
 *   node tmm-bulk.mjs 10 cj1laUY4QXBT
 *
 * Output: saves wallet keys + results to tmm-wallets.json
 */

import { ethers } from "ethers";

const AUTH_API = "https://6ro9f4alrvar.bonsaai.xyz";
const GAME_API = "https://ttm-api.bonsa.ai";
const ADFATHER_API = "https://api.adfather.xyz/api/v1";
const AD_UNIT = "X72qS2DiiPqx8FcaFhrY";
const TOUR_ID = "9ca3050a-3c71-4c3e-b07f-2144abfcd97c";

const COUNT = parseInt(process.argv[2] || "5");
const REF_CODE = process.argv[3] || "cj1laUY4QXBT";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const genOder = () => Array.from({length:16}, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random()*36)]).join("");

async function doWallet(index) {
  const wallet = ethers.Wallet.createRandom();
  const short = wallet.address.slice(0, 10) + "...";
  const result = { address: wallet.address, privateKey: wallet.privateKey, success: false, points: 0, tasks: 0, tournament: false, error: null };

  try {
    // Auth
    const nr = await (await fetch(AUTH_API + "/api/v1/auth/wallet/nonce", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({wallet_address: wallet.address})
    })).json();

    const msg = `quiz.tmm.world wants you to sign in with your Ethereum account:\n${wallet.address}\n\nSign this message to log in to Take My Muffin\n\nURI: https://quiz.tmm.world\nVersion: 1\nChain ID: 1\nNonce: ${nr.message.nonce}\nIssued At: ${new Date().toISOString()}`;
    const sig = await wallet.signMessage(msg);

    const ar = await (await fetch(AUTH_API + "/api/v1/auth/wallet/init", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({message: msg, signature: sig, wallet: {address: wallet.address, type: "EVM"}, meta: {referral_code: REF_CODE, fingerprint: "bulk-"+Date.now()+"-"+index}})
    })).json();
    const token = ar.message.access_token;
    if (!token) throw new Error("No token");

    // Tournament
    const parts = await (await fetch(GAME_API + "/api/v1/tournaments/" + TOUR_ID + "/participants", {
      headers: {Authorization: "Bearer " + token}
    })).json();
    const pids = (parts.message || []).slice(0, 8).map(p => p.id);
    const oderId = genOder();

    await fetch(GAME_API + "/api/v1/tournaments/" + TOUR_ID + "/progress/initialize", {
      method: "POST", headers: {"Content-Type":"application/json", Authorization: "Bearer " + token},
      body: JSON.stringify({oder_id: oderId, participant_ids: pids})
    });

    for (let round = 0; round < 3; round++) {
      const pd = await (await fetch(GAME_API + "/api/v1/tournaments/" + TOUR_ID + "/progress/oder/" + oderId, {
        headers: {Authorization: "Bearer " + token}
      })).json();
      const r = pd?.message?.rounds?.[round];
      if (!r) break;
      for (const m of r.matches) {
        if (m.winner_id || m.winner) continue;
        if (!m.participant1) continue;
        await fetch(GAME_API + "/api/v1/tournaments/" + TOUR_ID + "/progress/matches/" + m.id + "/result", {
          method: "POST", headers: {"Content-Type":"application/json", Authorization: "Bearer " + token},
          body: JSON.stringify({winner_id: m.participant1.id})
        });
        await sleep(200);
      }
      await sleep(300);
    }
    result.tournament = true;

    // Tasks
    await fetch(ADFATHER_API + "/ad/init", {
      method: "POST", headers: {"Content-Type":"application/json", Authorization: "Bearer " + token},
      body: JSON.stringify({external_id: null})
    });

    const feed = await (await fetch(ADFATHER_API + "/ad/feed/" + AD_UNIT, {
      headers: {Authorization: "Bearer " + token}
    })).json();

    let tasksDone = 0;
    for (const t of (feed.message || [])) {
      if (t.is_done) { tasksDone++; continue; }
      await fetch(ADFATHER_API + "/ad/task/click/" + t.id, {
        method: "POST", headers: {"Content-Type":"application/json", Authorization: "Bearer " + token},
        body: JSON.stringify({ad_unit_identity_key: AD_UNIT})
      });
      await sleep(1500);
      const check = await (await fetch(ADFATHER_API + "/ad/task/check/" + t.id, {
        method: "POST", headers: {"Content-Type":"application/json", Authorization: "Bearer " + token},
        body: JSON.stringify({ad_unit_identity_key: AD_UNIT, answer: null})
      })).json();
      if (check?.message?.is_done) tasksDone++;
      await sleep(300);
    }
    result.tasks = tasksDone;

    // Check points
    const app = await (await fetch(AUTH_API + "/api/v1/app-user/appdata", {
      headers: {Authorization: "Bearer " + token}
    })).json();
    const bal = app?.message?.balances?.find(b => b.currency === "APP_POINT");
    result.points = parseInt(bal?.ledger_amount || "0");
    result.success = true;

  } catch (e) {
    result.error = e.message;
  }

  return result;
}

// Main
console.log("╔═══════════════════════════════════════╗");
console.log("║     TMM Bulk Wallet Registration      ║");
console.log("╠═══════════════════════════════════════╣");
console.log(`║  Wallets: ${String(COUNT).padEnd(28)}║`);
console.log(`║  Referral: ${REF_CODE.padEnd(27)}║`);
console.log("╚═══════════════════════════════════════╝\n");

const results = [];
for (let i = 0; i < COUNT; i++) {
  process.stdout.write(`[${ts()}] [${i+1}/${COUNT}] `);
  const r = await doWallet(i);
  results.push(r);
  const status = r.success ? `✓ ${r.points}pts | ${r.tasks} tasks | tour:${r.tournament}` : `✗ ${r.error}`;
  console.log(`${r.address.slice(0,10)}... ${status}`);
  if (i < COUNT - 1) await sleep(2000);
}

// Summary
const ok = results.filter(r => r.success);
const fail = results.filter(r => !r.success);
const totalPts = ok.reduce((s, r) => s + r.points, 0);

console.log(`\n═══════════════════════════════════════`);
console.log(` ✅ ${ok.length} registered  ❌ ${fail.length} failed`);
console.log(` 📊 Total points: ${totalPts}`);
console.log(`═══════════════════════════════════════`);

if (fail.length > 0) {
  console.log("\nFailed:");
  fail.forEach(r => console.log(`  ${r.address.slice(0,10)}... — ${r.error}`));
}

// Save
import { writeFileSync } from "fs";
writeFileSync("tmm-wallets.json", JSON.stringify(results, null, 2));
console.log(`\nResults → tmm-wallets.json`);
