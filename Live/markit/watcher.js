#!/usr/bin/env node
/**
 * getmark.live Whitelist Form Watcher
 * 
 * Two detection methods:
 * 1. Deploy ID change — when they push new code, the dpl_xxx changes
 * 2. Page content change — monitors the JS bundle for form state flags
 *
 * Usage:
 *   DISCORD_WEBHOOK=https://discord.com/api/webhooks/... node markit-watcher.js
 */

import https from "https";

const SITE_URL = "https://getmark.live/";
const WEBHOOK = process.env.DISCORD_WEBHOOK;
const POLL_S = parseInt(process.env.POLL_INTERVAL_S || "120", 10);

if (!WEBHOOK) {
  console.error("❌ Set DISCORD_WEBHOOK in env");
  process.exit(1);
}

function ts() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    }).on("error", reject);
  });
}

function sendWebhook(title, description) {
  return new Promise((resolve, reject) => {
    const url = new URL(WEBHOOK);
    const body = JSON.stringify({
      content: "@everyone",
      embeds: [{
        title,
        description,
        color: 0x00ff88,
        url: "https://getmark.live/",
        timestamp: new Date().toISOString(),
        footer: { text: "markit-watcher" },
      }],
    });
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// State
let lastDeployId = null;
let lastAlertTime = 0;
const REALERT_MS = 30 * 60 * 1000;
let checkCount = 0;

async function check() {
  checkCount++;
  try {
    const { status, body } = await httpGet(SITE_URL);
    if (status !== 200) {
      console.log(`[${ts()}] #${checkCount} HTTP ${status}`);
      return;
    }

    // Extract deploy ID
    const dplMatch = body.match(/dpl_([a-zA-Z0-9]+)/);
    const currentDeploy = dplMatch ? dplMatch[1] : "unknown";

    // Extract all JS chunk URLs to check for form state in the RSC payload
    // The RSC payload contains serialized React component data
    const hasFormRef = body.includes('"form"') || body.includes('id="form"');
    const hasWhitelistOpen = body.includes("WHITELIST OPEN") || body.includes("whitelist_open") || body.includes("whitelistOpen");
    const hasClosed = body.includes("CLOSED") || body.includes("concluded") || body.includes("OFFLINE");

    // Detect deploy change
    const deployChanged = lastDeployId !== null && currentDeploy !== lastDeployId;

    if (deployChanged) {
      const msg = [
        `**New deployment detected!**`,
        "",
        `Old: \`dpl_${lastDeployId}\``,
        `New: \`dpl_${currentDeploy}\``,
        "",
        `Page signals: ${hasFormRef ? "form ref ✓" : "no form"} | ${hasWhitelistOpen ? "WL OPEN ✓" : ""} | ${hasClosed ? "has CLOSED text" : "no closed text"}`,
        "",
        "⚠️ Site was updated — check if whitelist form is now active!",
        "👉 https://getmark.live/",
      ].join("\n");

      console.log(`[${ts()}] 🔄 DEPLOY CHANGED! ${lastDeployId} → ${currentDeploy}`);

      if (Date.now() - lastAlertTime > REALERT_MS) {
        const code = await sendWebhook("🔄 [mark it] — Site Updated!", msg);
        console.log(`[${ts()}] Webhook sent (HTTP ${code})`);
        lastAlertTime = Date.now();
      }
    }

    lastDeployId = currentDeploy;

    if (checkCount % 10 === 0 || checkCount === 1) {
      console.log(`[${ts()}] #${checkCount} dpl_${currentDeploy} | closed:${hasClosed} | form:${hasFormRef}`);
    }
  } catch (e) {
    console.log(`[${ts()}] #${checkCount} Error: ${e.message}`);
  }
}

console.log(`[${ts()}] markit-watcher started`);
console.log(`[${ts()}] Polling every ${POLL_S}s`);
console.log("");

check();
setInterval(check, POLL_S * 1000);
