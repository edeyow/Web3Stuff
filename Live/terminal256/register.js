// TERMINAL256 Batch Verify — Paste in Console
// 1. Open https://www.terminal256.xyz/
// 2. F12 → Console → Paste this → Enter
// 3. Paste wallets (one per line) → Start

(() => {
  let running = false, results = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const panel = document.createElement("div");
  panel.style.cssText = "position:fixed;top:12px;right:12px;z-index:100000;background:#0a0a0a;border:1px solid #00ff88;border-radius:12px;padding:18px;width:380px;font-family:'Space Mono',monospace;color:#e0e0e0;box-shadow:0 0 40px rgba(0,255,136,0.12);max-height:92vh;overflow-y:auto";
  panel.innerHTML = `
    <div style="font-size:14px;font-weight:bold;color:#00ff88;margin-bottom:14px">▓ T256 Batch Verify</div>
    <div id="t256-status" style="font-size:11px;margin-bottom:8px;color:#666">Phase 2 closes: Mar 25 20:00 UTC</div>

    <label style="font-size:11px;color:#555;display:block;margin-bottom:4px">WALLETS (one per line)</label>
    <textarea id="t256-wallets" style="width:100%;height:140px;background:#060606;border:1px solid #1a1a1a;border-radius:8px;color:#e0e0e0;padding:8px;font-family:monospace;font-size:11px;resize:vertical;box-sizing:border-box" placeholder="0xabc123...
0xdef456...
0x789..."></textarea>

    <div id="t256-progress" style="margin-top:10px"></div>
    <div id="t256-log" style="font-size:11px;max-height:220px;overflow-y:auto;border:1px solid #1a1a1a;border-radius:8px;padding:8px;margin-top:10px;background:#060606;line-height:1.7;display:none"></div>

    <div style="display:flex;gap:8px;margin-top:12px">
      <button id="t256-start" style="flex:1;padding:10px;border:none;border-radius:8px;background:#00ff88;color:#000;font-weight:bold;cursor:pointer;font-size:13px;font-family:monospace">▶ Verify All</button>
      <button id="t256-stop" style="flex:1;padding:10px;border:none;border-radius:8px;background:#ff4444;color:#fff;font-weight:bold;cursor:pointer;font-size:13px;font-family:monospace;display:none">⏹ Stop</button>
    </div>
    <div id="t256-results" style="margin-top:10px;font-size:11px;display:none"></div>
  `;
  document.body.appendChild(panel);

  function log(msg, color = "#888") {
    const el = document.getElementById("t256-log");
    el.style.display = "block";
    const d = document.createElement("div");
    d.style.color = color;
    d.textContent = msg;
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
  }

  function setProgress(cur, total) {
    const el = document.getElementById("t256-progress");
    if (!total) { el.innerHTML = ""; return; }
    const pct = Math.round((cur / total) * 100);
    el.innerHTML = `<div style="background:#111;border-radius:4px;overflow:hidden;height:8px">
      <div style="background:linear-gradient(90deg,#00ff88,#00ccff);height:100%;width:${pct}%;transition:width 0.4s"></div>
    </div><div style="text-align:center;margin-top:4px;font-size:11px;color:#555">${cur}/${total}</div>`;
  }

  function parseWallets(text) {
    return text.trim().split("\n")
      .map(l => l.trim().replace(/,.*$/, ""))
      .filter(l => /^0x[a-fA-F0-9]{40}$/.test(l));
  }

  async function verifyWallet(wallet) {
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: wallet.toLowerCase() })
    });

    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      throw new Error(`Rate limited — retry in ${data.retryAfterSec || 60}s`);
    }

    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async function startBatch() {
    const wallets = parseWallets(document.getElementById("t256-wallets").value);
    if (!wallets.length) { alert("Paste at least one valid 0x... wallet address"); return; }

    // Deduplicate
    const unique = [...new Set(wallets.map(w => w.toLowerCase()))];

    running = true; results = [];
    document.getElementById("t256-start").style.display = "none";
    document.getElementById("t256-stop").style.display = "block";
    document.getElementById("t256-results").style.display = "none";
    document.getElementById("t256-wallets").disabled = true;

    log(`Starting: ${unique.length} wallet(s)`, "#00ff88");

    for (let i = 0; i < unique.length; i++) {
      if (!running) { log("Stopped", "#ff4444"); break; }

      const w = unique[i];
      const short = `${w.slice(0, 8)}...${w.slice(-4)}`;
      setProgress(i, unique.length);

      try {
        const data = await verifyWallet(w);
        const status = data.inserted ? "NEW ✓" : "ALREADY VERIFIED ✓";
        log(`[${i+1}/${unique.length}] ${short} — ${status}`, data.inserted ? "#00ff88" : "#00ccff");
        results.push({ wallet: w, success: true, inserted: data.inserted });
      } catch (e) {
        if (e.message.includes("Rate limited")) {
          log(`[${i+1}] ${short} — rate limited, waiting 65s...`, "#ffaa00");
          await sleep(65000);
          // Retry once
          try {
            const data = await verifyWallet(w);
            const status = data.inserted ? "NEW ✓" : "ALREADY VERIFIED ✓";
            log(`[${i+1}/${unique.length}] ${short} — ${status} (retry)`, "#00ff88");
            results.push({ wallet: w, success: true, inserted: data.inserted });
          } catch (e2) {
            log(`[${i+1}] ${short} — ✗ ${e2.message}`, "#ff4444");
            results.push({ wallet: w, success: false, error: e2.message });
          }
        } else {
          log(`[${i+1}] ${short} — ✗ ${e.message}`, "#ff4444");
          results.push({ wallet: w, success: false, error: e.message });
        }
      }

      setProgress(i + 1, unique.length);

      // Delay between requests to avoid rate limit
      if (i < unique.length - 1 && running) {
        const delay = 2000 + Math.random() * 3000;
        await sleep(delay);
      }
    }

    running = false;
    const ok = results.filter(r => r.success).length;
    const newOnes = results.filter(r => r.inserted).length;
    const dupes = ok - newOnes;
    const fail = results.filter(r => !r.success).length;

    log(`\n═══ DONE: ${newOnes} new, ${dupes} dupes, ${fail} failed ═══`, "#00ff88");

    const resEl = document.getElementById("t256-results");
    resEl.style.display = "block";
    resEl.innerHTML = results.map(r =>
      `<div style="color:${r.success ? (r.inserted ? "#00ff88" : "#00ccff") : "#ff4444"}">${r.success ? "✓" : "✗"} ${r.wallet.slice(0,10)}... — ${r.success ? (r.inserted ? "verified" : "already in") : r.error}</div>`
    ).join("") + `<button onclick="navigator.clipboard.writeText('${results.filter(r=>r.success).map(r=>r.wallet).join('\\n')}').then(()=>this.textContent='Copied!')" style="margin-top:8px;padding:6px 12px;border:1px solid #222;border-radius:6px;background:#0a0a0a;color:#888;cursor:pointer;font-size:11px;font-family:monospace">📋 Copy verified wallets</button>`;

    document.getElementById("t256-start").style.display = "block";
    document.getElementById("t256-stop").style.display = "none";
    document.getElementById("t256-wallets").disabled = false;
    console.log("T256 Results:", results);
  }

  document.getElementById("t256-start").onclick = startBatch;
  document.getElementById("t256-stop").onclick = () => { running = false; };
})();
