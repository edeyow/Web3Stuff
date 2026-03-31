// ETHERNALFLUFF Batch Register — Paste in Console
// 1. Open https://www.ethernalfluffs.xyz/waitlist
// 2. F12 → Console → Paste this entire script → Enter
// 3. Fill in wallets + referral in the panel that appears → Start

(() => {
  const SITE_KEY = "0x4AAAAAACvCIsl9t330Qtwu";
  let running = false, results = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // --- UI Panel ---
  const panel = document.createElement("div");
  panel.style.cssText = "position:fixed;top:12px;right:12px;z-index:100000;background:#0d0d1a;border:1px solid #4ade80;border-radius:14px;padding:18px;width:400px;font-family:monospace;color:#e0e0e0;box-shadow:0 0 40px rgba(74,222,128,0.15);max-height:92vh;overflow-y:auto";
  panel.innerHTML = `
    <div style="font-size:15px;font-weight:bold;color:#4ade80;margin-bottom:14px">🐾 FLUFF Batch Register</div>

    <label style="font-size:11px;color:#888;display:block;margin-bottom:4px">WALLETS (one per line: address,handle)</label>
    <textarea id="fluff-wallets" style="width:100%;height:120px;background:#080812;border:1px solid #222;border-radius:8px;color:#e0e0e0;padding:8px;font-family:monospace;font-size:11px;resize:vertical" placeholder="0xabc123...,@handle1
0xdef456...,@handle2
0x789...,@handle3"></textarea>

    <label style="font-size:11px;color:#888;display:block;margin-top:10px;margin-bottom:4px">REFERRAL CODE (optional)</label>
    <input id="fluff-ref" value="FLUFF-GUZVJT" style="width:100%;background:#080812;border:1px solid #222;border-radius:8px;color:#e0e0e0;padding:8px;font-family:monospace;font-size:12px;box-sizing:border-box" placeholder="FLUFF-XXXXXX">

    <div id="fluff-progress" style="margin-top:12px"></div>
    <div id="fluff-log" style="font-size:11px;max-height:220px;overflow-y:auto;border:1px solid #222;border-radius:8px;padding:8px;margin-top:10px;background:#080812;line-height:1.7;display:none"></div>
    <div id="fluff-turnstile-box" style="margin-top:10px;display:flex;align-items:center;justify-content:center;min-height:0"></div>

    <div style="display:flex;gap:8px;margin-top:12px">
      <button id="fluff-start" style="flex:1;padding:10px;border:none;border-radius:8px;background:#4ade80;color:#000;font-weight:bold;cursor:pointer;font-size:13px">▶ Start</button>
      <button id="fluff-stop" style="flex:1;padding:10px;border:none;border-radius:8px;background:#ef4444;color:#fff;font-weight:bold;cursor:pointer;font-size:13px;display:none">⏹ Stop</button>
    </div>
    <div id="fluff-results" style="margin-top:10px;font-size:11px;display:none"></div>
  `;
  document.body.appendChild(panel);

  function log(msg, color = "#aaa") {
    const el = document.getElementById("fluff-log");
    el.style.display = "block";
    const d = document.createElement("div");
    d.style.color = color;
    d.textContent = msg;
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
  }

  function setProgress(cur, total) {
    const el = document.getElementById("fluff-progress");
    if (!total) { el.innerHTML = ""; return; }
    const pct = Math.round((cur / total) * 100);
    el.innerHTML = `<div style="background:#1a1a2e;border-radius:4px;overflow:hidden;height:8px">
      <div style="background:linear-gradient(90deg,#4ade80,#22d3ee);height:100%;width:${pct}%;transition:width 0.4s"></div>
    </div><div style="text-align:center;margin-top:4px;font-size:11px;color:#888">${cur}/${total}</div>`;
  }

  function parseWallets(text) {
    return text.trim().split("\n").filter(l => l.trim()).map(line => {
      const parts = line.trim().split(/[,\t]+/);
      if (parts.length < 2) return null;
      return { address: parts[0].trim(), xHandle: parts[1].trim() };
    }).filter(Boolean);
  }

  // --- Turnstile ---
  function getTurnstileToken() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Turnstile timeout")), 60000);
      const box = document.getElementById("fluff-turnstile-box");
      box.innerHTML = "";
      const div = document.createElement("div");
      div.id = "fluff-cf-" + Date.now();
      box.appendChild(div);

      const render = () => {
        window.turnstile.render("#" + div.id, {
          sitekey: SITE_KEY, theme: "dark",
          callback: t => { clearTimeout(timeout); resolve(t); },
          "error-callback": e => { clearTimeout(timeout); reject(new Error("Turnstile error: " + e)); },
          "timeout-callback": () => { clearTimeout(timeout); reject(new Error("Turnstile timed out")); }
        });
      };

      if (window.turnstile) { render(); return; }
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.onload = () => { const w = () => window.turnstile ? render() : setTimeout(w, 200); w(); };
      s.onerror = () => { clearTimeout(timeout); reject(new Error("Script load failed")); };
      document.head.appendChild(s);
    });
  }

  // --- Register ---
  async function registerWallet(wallet, token, ref) {
    const handle = wallet.xHandle.startsWith("@") ? wallet.xHandle : "@" + wallet.xHandle;
    const res = await fetch("/api/waitlist/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: wallet.address.trim().toLowerCase(),
        xHandle: handle,
        referralCode: ref || undefined,
        followDone: true, retweetDone: true,
        cfTurnstileToken: token
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  // --- Batch ---
  async function startBatch() {
    const wallets = parseWallets(document.getElementById("fluff-wallets").value);
    const ref = document.getElementById("fluff-ref").value.trim();

    if (!wallets.length) { alert("Paste at least one wallet line: address,handle"); return; }

    running = true; results = [];
    document.getElementById("fluff-start").style.display = "none";
    document.getElementById("fluff-stop").style.display = "block";
    document.getElementById("fluff-results").style.display = "none";
    document.getElementById("fluff-wallets").disabled = true;
    document.getElementById("fluff-ref").disabled = true;

    log(`Starting: ${wallets.length} wallet(s)${ref ? " | Ref: " + ref : ""}`, "#4ade80");

    for (let i = 0; i < wallets.length; i++) {
      if (!running) { log("Stopped", "#ef4444"); break; }

      const w = wallets[i];
      const short = `${w.address.slice(0, 8)}...${w.address.slice(-4)}`;
      const handle = w.xHandle.startsWith("@") ? w.xHandle : "@" + w.xHandle;
      setProgress(i, wallets.length);
      log(`\n[${i + 1}/${wallets.length}] ${handle} / ${short}`, "#fff");

      try {
        log("  Solving Turnstile...", "#888");
        const token = await getTurnstileToken();
        log("  Turnstile ✓", "#4ade80");

        log("  Registering...", "#888");
        const data = await registerWallet(w, token, ref);
        log(`  ✓ Points: ${data.user?.points || "?"} | Code: ${data.user?.referralCode || "?"}`, "#4ade80");
        results.push({ ...w, success: true, user: data.user });
      } catch (e) {
        log(`  ✗ ${e.message}`, "#ef4444");
        results.push({ ...w, success: false, error: e.message });
      }

      setProgress(i + 1, wallets.length);
      if (i < wallets.length - 1 && running) {
        log("  Waiting 6s...", "#555");
        await sleep(6000);
      }
    }

    running = false;
    const ok = results.filter(r => r.success).length;
    const fail = results.filter(r => !r.success).length;
    log(`\n═══ DONE: ${ok} ✓ / ${fail} ✗ ═══`, "#4ade80");

    const resEl = document.getElementById("fluff-results");
    resEl.style.display = "block";
    resEl.innerHTML = results.map(r =>
      `<div style="color:${r.success ? "#4ade80" : "#ef4444"}">${r.success ? "✓" : "✗"} ${r.xHandle} — ${r.success ? "Registered (" + (r.user?.referralCode || "ok") + ")" : r.error}</div>`
    ).join("") + `<button onclick="navigator.clipboard.writeText(JSON.stringify(${JSON.stringify(results)},null,2)).then(()=>this.textContent='Copied!')" style="margin-top:8px;padding:6px 12px;border:1px solid #333;border-radius:6px;background:#1a1a2e;color:#ccc;cursor:pointer;font-size:11px">📋 Copy JSON</button>`;

    document.getElementById("fluff-start").style.display = "block";
    document.getElementById("fluff-stop").style.display = "none";
    document.getElementById("fluff-wallets").disabled = false;
    document.getElementById("fluff-ref").disabled = false;
    console.log("FLUFF Results:", results);
  }

  document.getElementById("fluff-start").onclick = startBatch;
  document.getElementById("fluff-stop").onclick = () => { running = false; };
})();
