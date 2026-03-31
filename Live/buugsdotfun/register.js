// BUUGS Batch Register — Paste in console on wallet.buugs.fun
// 1. Open https://wallet.buugs.fun
// 2. F12 → Console → Paste this → Enter
// 3. Paste wallets (one per line) → Submit

(() => {
  const SUPABASE_URL = "https://ksvdvfongjfavjlxuahi.supabase.co";
  const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdmR2Zm9uZ2pmYXZqbHh1YWhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MTUwMzIsImV4cCI6MjA5MDI5MTAzMn0.6l7QDcTPT1Ic8TBPF9RMkQFkitw7OT9hBBmgqWXsK54";
  const RPC_URL = `${SUPABASE_URL}/rest/v1/rpc/submit_wallet_submission`;

  let running = false, results = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const panel = document.createElement("div");
  panel.style.cssText = "position:fixed;top:12px;right:12px;z-index:100000;background:#1a1a2e;border:1px solid #7fff00;border-radius:12px;padding:18px;width:380px;font-family:monospace;color:#e0e0e0;box-shadow:0 0 30px rgba(127,255,0,0.1);max-height:92vh;overflow-y:auto";
  panel.innerHTML = `
    <div style="font-size:14px;font-weight:bold;color:#7fff00;margin-bottom:14px">🐞 BUUGS Batch Register</div>

    <label style="font-size:11px;color:#555;display:block;margin-bottom:4px">WALLETS (one per line)</label>
    <textarea id="bg-wallets" style="width:100%;height:140px;background:#0d0d1a;border:1px solid #222;border-radius:8px;color:#e0e0e0;padding:8px;font-family:monospace;font-size:11px;resize:vertical;box-sizing:border-box" placeholder="0xabc123...
0xdef456...
0x789..."></textarea>

    <div id="bg-progress" style="margin-top:10px"></div>
    <div id="bg-log" style="font-size:11px;max-height:220px;overflow-y:auto;border:1px solid #222;border-radius:8px;padding:8px;margin-top:10px;background:#0d0d1a;line-height:1.7;display:none"></div>

    <div style="display:flex;gap:8px;margin-top:12px">
      <button id="bg-start" style="flex:1;padding:10px;border:none;border-radius:8px;background:#7fff00;color:#000;font-weight:bold;cursor:pointer;font-size:13px;font-family:monospace">🐞 Drop Wallets</button>
      <button id="bg-stop" style="flex:1;padding:10px;border:none;border-radius:8px;background:#ff4444;color:#fff;font-weight:bold;cursor:pointer;font-size:13px;font-family:monospace;display:none">⏹ Stop</button>
    </div>
    <div id="bg-results" style="margin-top:10px;font-size:11px;display:none"></div>
  `;
  document.body.appendChild(panel);

  function log(msg, color = "#888") {
    const el = document.getElementById("bg-log");
    el.style.display = "block";
    const d = document.createElement("div");
    d.style.color = color;
    d.textContent = msg;
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
  }

  function setProgress(cur, total) {
    const el = document.getElementById("bg-progress");
    if (!total) { el.innerHTML = ""; return; }
    const pct = Math.round((cur / total) * 100);
    el.innerHTML = `<div style="background:#111;border-radius:4px;overflow:hidden;height:8px">
      <div style="background:#7fff00;height:100%;width:${pct}%;transition:width 0.4s"></div>
    </div><div style="text-align:center;margin-top:4px;font-size:11px;color:#555">${cur}/${total}</div>`;
  }

  function parseWallets(text) {
    return [...new Set(
      text.trim().split("\n")
        .map(l => l.trim().replace(/,.*$/, ""))
        .filter(l => /^0x[a-fA-F0-9]{40}$/.test(l))
    )];
  }

  async function submitWallet(wallet) {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY,
      },
      body: JSON.stringify({ p_wallet_address: wallet }),
    });

    if (res.status === 409) throw new Error("already submitted");
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.message || `HTTP ${res.status}`);
    }
    return await res.json();
  }

  async function startBatch() {
    const wallets = parseWallets(document.getElementById("bg-wallets").value);
    if (!wallets.length) { alert("Paste at least one valid 0x wallet address"); return; }

    running = true; results = [];
    document.getElementById("bg-start").style.display = "none";
    document.getElementById("bg-stop").style.display = "block";
    document.getElementById("bg-results").style.display = "none";
    document.getElementById("bg-wallets").disabled = true;

    log(`Starting: ${wallets.length} wallet(s)`, "#7fff00");

    for (let i = 0; i < wallets.length; i++) {
      if (!running) { log("Stopped", "#ff4444"); break; }

      const w = wallets[i];
      const short = `${w.slice(0, 8)}...${w.slice(-4)}`;
      setProgress(i, wallets.length);

      try {
        await submitWallet(w);
        log(`[${i+1}/${wallets.length}] ${short} — ✓`, "#7fff00");
        results.push({ wallet: w, success: true });
      } catch (e) {
        const isDupe = e.message.includes("already");
        log(`[${i+1}/${wallets.length}] ${short} — ${isDupe ? "⚠ dupe" : "✗ " + e.message}`, isDupe ? "#ffaa00" : "#ff4444");
        results.push({ wallet: w, success: false, error: e.message });
      }

      setProgress(i + 1, wallets.length);

      if (i < wallets.length - 1 && running) {
        await sleep(1000 + Math.random() * 1500);
      }
    }

    running = false;
    const ok = results.filter(r => r.success).length;
    const dupes = results.filter(r => r.error === "already submitted").length;
    const fail = results.filter(r => !r.success && r.error !== "already submitted").length;
    log(`\n═══ DONE: ${ok} new ✓ / ${dupes} dupes ⚠ / ${fail} failed ✗ ═══`, "#7fff00");

    const resEl = document.getElementById("bg-results");
    resEl.style.display = "block";
    resEl.innerHTML = results.map(r =>
      `<div style="color:${r.success ? "#7fff00" : r.error === "already submitted" ? "#ffaa00" : "#ff4444"}">${r.success ? "✓" : r.error === "already submitted" ? "⚠" : "✗"} ${r.wallet.slice(0,10)}...${r.success ? "" : " — " + r.error}</div>`
    ).join("");

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "📋 Copy JSON";
    copyBtn.style.cssText = "margin-top:8px;padding:6px 12px;border:1px solid #333;border-radius:6px;background:#1a1a2e;color:#888;cursor:pointer;font-size:11px;font-family:monospace";
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(JSON.stringify(results, null, 2)).then(() => { copyBtn.textContent = "Copied!"; });
    };
    resEl.appendChild(copyBtn);

    document.getElementById("bg-start").style.display = "block";
    document.getElementById("bg-stop").style.display = "none";
    document.getElementById("bg-wallets").disabled = false;
  }

  document.getElementById("bg-start").onclick = startBatch;
  document.getElementById("bg-stop").onclick = () => { running = false; };
})();
