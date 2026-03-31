#!/usr/bin/env node
/**
 * [mark it] Waitlist Auto-Register with Monitoring
 *
 * Modes:
 *   WATCH   — polls site + DB until whitelist opens, then auto-registers
 *   FIRE    — registers immediately (skip monitoring)
 *
 * Usage:
 *   node markit-register.js watch wallets.csv          # monitor & auto-fire
 *   node markit-register.js fire wallets.csv           # register now
 *   node markit-register.js status                     # check current state
 *
 * wallets.csv format (no header):
 *   0xabc...,@handle1,email1@gmail.com
 *   0xdef...,@handle2,email2@gmail.com
 *
 * Optional 4th column for discord:
 *   0xabc...,@handle1,email1@gmail.com,user#1234
 *
 * Environment:
 *   REFERRAL        — referral code to set as referred_by (optional)
 *   MIN_DELAY_S     — min seconds between registrations (default: 180 = 3min)
 *   MAX_DELAY_S     — max seconds between registrations (default: 480 = 8min)
 *   POLL_INTERVAL_S — how often to check in watch mode (default: 120 = 2min)
 *   MIN_REAL_USERS  — register after N real users appear even if banner stays (default: 3)
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

// ── Config ──────────────────────────────────────────────────
const SUPABASE_URL = "https://wbmoohotvkmgjymlelxs.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndibW9vaG90dmttZ2p5bWxlbHhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNzI0NTcsImV4cCI6MjA4OTk0ODQ1N30.yQq-cZLPAfwkfQSL3MzAlYFlos7vBsDcc3-n1yaSFaw";
const SITE_URL = "https://getmark.live/";

const REFERRAL = process.env.REFERRAL || "";
const MIN_DELAY = parseInt(process.env.MIN_DELAY_S || "180", 10);
const MAX_DELAY = parseInt(process.env.MAX_DELAY_S || "480", 10);
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_S || "120", 10);
const MIN_REAL_USERS = parseInt(process.env.MIN_REAL_USERS || "3", 10);

// Our test record to ignore when counting real users
const IGNORE_HANDLES = ["test_recon"];

// ── HTTP helpers ────────────────────────────────────────────
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: options.method || "GET",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    };

    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      { hostname: parsed.hostname, path: parsed.pathname, method: "GET" },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

// ── Supabase API ────────────────────────────────────────────
async function getApplications() {
  const res = await httpRequest(
    `${SUPABASE_URL}/rest/v1/applications?select=*&order=created_at.asc`
  );
  return JSON.parse(res.body);
}

async function getCount() {
  const res = await httpRequest(
    `${SUPABASE_URL}/rest/v1/applications?select=id`,
    { headers: { Prefer: "count=exact", Range: "0-0" } }
  );
  const range = res.headers["content-range"] || "*/0";
  const total = parseInt(range.split("/")[1], 10);
  return total;
}

async function insertApplication(wallet) {
  const data = {
    twitter_handle: wallet.handle.replace(/^@/, ""),
    wallet_address: wallet.address.trim().toLowerCase(),
    email: wallet.email.trim(),
    hide_wallet: false,
  };
  if (wallet.discord) data.discord = wallet.discord.trim();
  if (REFERRAL) data.referred_by = REFERRAL;

  const res = await httpRequest(
    `${SUPABASE_URL}/rest/v1/applications`,
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(data),
    }
  );

  if (res.status >= 400) {
    const err = JSON.parse(res.body);
    throw new Error(err.message || err.error || `HTTP ${res.status}`);
  }

  return JSON.parse(res.body)[0];
}

// ── Site check ──────────────────────────────────────────────
async function isWhitelistClosed() {
  try {
    const html = await fetchPage(SITE_URL);
    return html.includes("WHITELIST CLOSED");
  } catch (e) {
    console.log(`  ⚠ Site check failed: ${e.message}`);
    return true; // assume closed on error
  }
}

// ── CSV parser ──────────────────────────────────────────────
function parseCSV(filepath) {
  const raw = fs.readFileSync(path.resolve(filepath), "utf8");
  return raw
    .trim()
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((line) => {
      const parts = line.trim().split(",").map((s) => s.trim());
      if (parts.length < 3) {
        console.log(`  ⚠ Skipping malformed line: ${line}`);
        return null;
      }
      return {
        address: parts[0],
        handle: parts[1],
        email: parts[2],
        discord: parts[3] || null,
      };
    })
    .filter(Boolean);
}

// ── Helpers ─────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomDelay() {
  const ms = (MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY)) * 1000;
  return Math.round(ms);
}

function ts() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

// ── Status command ──────────────────────────────────────────
async function showStatus() {
  console.log("\n🔍 [mark it] Status Check\n");

  const closed = await isWhitelistClosed();
  console.log(`  Frontend: ${closed ? "🔒 WHITELIST CLOSED" : "🟢 WHITELIST OPEN"}`);

  const apps = await getApplications();
  const real = apps.filter((a) => !IGNORE_HANDLES.includes(a.twitter_handle));
  console.log(`  Total entries: ${apps.length} (${real.length} real)`);

  if (apps.length > 0) {
    console.log("\n  Entries:");
    apps.forEach((a, i) => {
      const tag = IGNORE_HANDLES.includes(a.twitter_handle) ? " ← TEST" : "";
      console.log(
        `    ${i + 1}. @${a.twitter_handle} | ${a.wallet_address.slice(0, 10)}... | ${a.email} | pos:${a.queue_position}${tag}`
      );
    });
  }

  const remaining = Math.max(0, 500 - apps.length);
  console.log(`\n  Spots remaining: ${remaining}/500`);
}

// ── Fire (register all) ────────────────────────────────────
async function fireRegistrations(wallets) {
  console.log(`\n🚀 Firing ${wallets.length} registration(s)\n`);
  if (REFERRAL) console.log(`  Referral: ${REFERRAL}`);

  const results = [];

  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    const short = `${w.address.slice(0, 8)}...${w.address.slice(-4)}`;
    process.stdout.write(
      `  [${ts()}] [${i + 1}/${wallets.length}] @${w.handle} / ${short} ... `
    );

    try {
      const record = await insertApplication(w);
      console.log(
        `✓ pos:${record.queue_position} | ${record.is_founding_member ? "FOUNDING" : "regular"}`
      );
      results.push({ ...w, success: true, position: record.queue_position });
    } catch (e) {
      console.log(`✗ ${e.message}`);
      results.push({ ...w, success: false, error: e.message });
    }

    // Random delay between registrations
    if (i < wallets.length - 1) {
      const delay = randomDelay();
      const mins = (delay / 60000).toFixed(1);
      console.log(`  [${ts()}] ⏸  Next in ${mins}min...`);
      await sleep(delay);
    }
  }

  // Summary
  const ok = results.filter((r) => r.success);
  const fail = results.filter((r) => !r.success);

  console.log("\n═══════════════════════════════════════");
  console.log(` ✅ ${ok.length} registered  ❌ ${fail.length} failed`);
  console.log("═══════════════════════════════════════");

  if (fail.length > 0) {
    console.log("\nFailed:");
    fail.forEach((f) => console.log(`  @${f.handle} — ${f.error}`));
  }

  // Save results
  const outPath = path.resolve("markit-results.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nResults → ${outPath}`);

  return results;
}

// ── Watch mode ──────────────────────────────────────────────
async function watchAndFire(wallets) {
  console.log("\n👁  [mark it] Watch Mode");
  console.log("═══════════════════════════════════════");
  console.log(`  Wallets loaded: ${wallets.length}`);
  console.log(`  Poll interval: ${POLL_INTERVAL}s`);
  console.log(`  Delay range: ${MIN_DELAY}-${MAX_DELAY}s between registrations`);
  console.log(`  Trigger: whitelist opens OR ${MIN_REAL_USERS}+ real users appear`);
  if (REFERRAL) console.log(`  Referral: ${REFERRAL}`);
  console.log("═══════════════════════════════════════\n");

  let fired = false;

  while (!fired) {
    try {
      // Check 1: Is whitelist still closed on frontend?
      const closed = await isWhitelistClosed();

      // Check 2: How many real entries in DB?
      const apps = await getApplications();
      const realUsers = apps.filter(
        (a) => !IGNORE_HANDLES.includes(a.twitter_handle)
      );

      console.log(
        `  [${ts()}] Frontend: ${closed ? "🔒 Closed" : "🟢 OPEN"} | DB: ${apps.length} total, ${realUsers.length} real`
      );

      // Trigger conditions
      if (!closed) {
        console.log("\n  🟢 WHITELIST IS OPEN — firing registrations!\n");
        fired = true;
      } else if (realUsers.length >= MIN_REAL_USERS) {
        console.log(
          `\n  👥 ${realUsers.length} real users detected (threshold: ${MIN_REAL_USERS}) — firing!\n`
        );
        fired = true;
      }

      if (fired) {
        await fireRegistrations(wallets);
        return;
      }
    } catch (e) {
      console.log(`  [${ts()}] ⚠ Error: ${e.message}`);
    }

    // Wait before next poll
    await sleep(POLL_INTERVAL * 1000);
  }
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  const command = process.argv[2];

  if (!command || command === "--help" || command === "-h") {
    console.log(`
[mark it] Waitlist Auto-Register

Usage:
  node markit-register.js status                    Check site & DB status
  node markit-register.js watch wallets.csv         Monitor & auto-register when open
  node markit-register.js fire wallets.csv          Register immediately

wallets.csv format (no header):
  0xaddress,@xhandle,email@domain.com
  0xaddress,@xhandle,email@domain.com,discord#1234

Environment:
  REFERRAL=FLUFF-XXX      Referral code
  MIN_DELAY_S=180          Min seconds between registrations (default: 3min)
  MAX_DELAY_S=480          Max seconds between registrations (default: 8min)
  POLL_INTERVAL_S=120      Watch mode poll interval (default: 2min)
  MIN_REAL_USERS=3         Fire when N real users appear (default: 3)
`);
    return;
  }

  if (command === "status") {
    await showStatus();
    return;
  }

  const csvFile = process.argv[3];
  if (!csvFile) {
    console.error("Error: provide a wallets.csv file");
    process.exit(1);
  }

  const wallets = parseCSV(csvFile);
  if (wallets.length === 0) {
    console.error("Error: no valid wallets found in CSV");
    process.exit(1);
  }

  console.log(`  Loaded ${wallets.length} wallet(s) from ${csvFile}`);

  if (command === "fire") {
    await fireRegistrations(wallets);
  } else if (command === "watch") {
    await watchAndFire(wallets);
  } else {
    console.error(`Unknown command: ${command}. Use status/watch/fire.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
