// YUGEN Batch Register — Paste in console on yugen.gg
// 1. Open https://yugen.gg
// 2. F12 → Console → Paste this → Enter
// 3. Paste wallets (handle,wallet per line) → Submit

(() => {
  const API = "https://bxrokcvbdsjwgeonjknv.supabase.co/functions/v1/bright-responder";
  const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4cm9rY3ZiZHNqd2dlb25qa252Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MDcxNTgsImV4cCI6MjA5MDM4MzE1OH0.N8d3Bp1bEiJMbhB_OGkU3bg1BMNqWszm7c-7cdudslM";

  let running = false, results = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const panel = document.createElement("div");
  panel.style.cssText = "position:fixed;top:12px;right:12px;z-index:100000;background:#0a0a0a;border:1px solid #fff;border-radius:12px;padding:18px;width:400px;font-family:monospace;color:#e0e0e0;box-shadow:0 0 30px rgba(255,255,255,0.08);max-height:92vh;overflow-y:auto";
  panel.innerHTML = `
    <div style="font-size:14px;font-weight:bold;color:#fff;margin-bottom:14px">幽玄 YUGEN Batch Register</div>

    <label style="font-size:11px;color:#555;display:block;margin-bottom:4px">ENTRIES (one per line: handle,wallet)</label>
    <textarea id="yg-entries" style="width:100%;height:140px;background:#060606;border:1px solid #1a1a1a;border-radius:8px;color:#e0e0e0;padding:8px;font-family:monospace;font-size:11px;resize:vertical;box-sizing:border-box" placeholder="@handle1,0xabc123...
@handle2,0xdef456...
@handle3,0x789..."></textarea>

    <div id="yg-progress" style="margin-top:10px"></div>
    <div id="yg-log" style="font-size:11px;max-height:220px;overflow-y:auto;border:1px solid #1a1a1a;border-radius:8px;padding:8px;margin-top:10px;background:#060606;line-height:1.7;display:none"></div>

    <div style="display:flex;gap:8px;margin-top:12px">
      <button id="yg-start" style="flex:1;padding:10px;border:none;border-radius:8px;background:#fff;color:#000;font-weight:bold;cursor:pointer;font-size:13px;font-family:monospace">送信 Submit</button>
      <button id="yg-stop" style="flex:1;padding:10px;border:none;border-radius:8px;background:#ff4444;color:#fff;font-weight:bold;cursor:pointer;font-size:13px;font-family:monospace;display:none">⏹ Stop</button>
    </div>
    <div id="yg-results" style="margin-top:10px;font-size:11px;display:none"></div>
  `;
  document.body.appendChild(panel);

  function log(msg, color = "#888") {
    const el = document.getElementById("yg-log");
    el.style.display = "block";
    const d = document.createElement("div");
    d.style.color = color;
    d.textContent = msg;
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
  }

  function setProgress(cur, total) {
    const el = document.getElementById("yg-progress");
    if (!total) { el.innerHTML = ""; return; }
    const pct = Math.round((cur / total) * 100);
    el.innerHTML = `<div style="background:#111;border-radius:4px;overflow:hidden;height:8px">
      <div style="background:#fff;height:100%;width:${pct}%;transition:width 0.4s"></div>
    </div><div style="text-align:center;margin-top:4px;font-size:11px;color:#555">${cur}/${total}</div>`;
  }

  function parseEntries(text) {
    return text.trim().split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .map(line => {
        const parts = line.split(/[,\t]+/);
        if (parts.length < 2) return null;
        const handle = parts[0].trim();
        const wallet = parts[1].trim();
        if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) return null;
        return { xhandle: handle.startsWith("@") ? handle : "@" + handle, wallet };
      })
      .filter(Boolean);
  }

  async function submitEntry(entry) {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + KEY,
        "apikey": KEY,
      },
      body: JSON.stringify({ wallet: entry.wallet, xhandle: entry.xhandle }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
    }
    return await res.json().catch(() => ({ ok: true }));
  }

  async function startBatch() {
    const entries = parseEntries(document.getElementById("yg-entries").value);
    if (!entries.length) { alert("Paste at least one valid entry: handle,0xwallet"); return; }

    running = true; results = [];
    document.getElementById("yg-start").style.display = "none";
    document.getElementById("yg-stop").style.display = "block";
    document.getElementById("yg-results").style.display = "none";
    document.getElementById("yg-entries").disabled = true;

    log(`Starting: ${entries.length} entries`, "#fff");

    for (let i = 0; i < entries.length; i++) {
      if (!running) { log("Stopped", "#ff4444"); break; }

      const e = entries[i];
      const short = `${e.wallet.slice(0, 8)}...${e.wallet.slice(-4)}`;
      setProgress(i, entries.length);

      try {
        await submitEntry(e);
        log(`[${i+1}/${entries.length}] ${e.xhandle} / ${short} — ✓`, "#fff");
        results.push({ ...e, success: true });
      } catch (err) {
        log(`[${i+1}/${entries.length}] ${e.xhandle} / ${short} — ✗ ${err.message}`, "#ff4444");
        results.push({ ...e, success: false, error: err.message });
      }

      setProgress(i + 1, entries.length);

      if (i < entries.length - 1 && running) {
        await sleep(1500 + Math.random() * 1500);
      }
    }

    running = false;
    const ok = results.filter(r => r.success).length;
    const fail = results.filter(r => !r.success).length;
    log(`\n═══ DONE: ${ok} ✓ / ${fail} ✗ ═══`, "#fff");

    const resEl = document.getElementById("yg-results");
    resEl.style.display = "block";
    resEl.innerHTML = results.map(r =>
      `<div style="color:${r.success ? "#fff" : "#ff4444"}">${r.success ? "✓" : "✗"} ${r.xhandle} / ${r.wallet.slice(0,10)}...${r.success ? "" : " — " + r.error}</div>`
    ).join("");
    const copyBtn = document.createElement("button");
    copyBtn.textContent = "📋 Copy JSON";
    copyBtn.style.cssText = "margin-top:8px;padding:6px 12px;border:1px solid #333;border-radius:6px;background:#0a0a0a;color:#888;cursor:pointer;font-size:11px;font-family:monospace";
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(JSON.stringify(results, null, 2)).then(() => { copyBtn.textContent = "Copied!"; });
    };
    resEl.appendChild(copyBtn);

    document.getElementById("yg-start").style.display = "block";
    document.getElementById("yg-stop").style.display = "none";
    document.getElementById("yg-entries").disabled = false;
  }

  document.getElementById("yg-start").onclick = startBatch;
  document.getElementById("yg-stop").onclick = () => { running = false; };
})();
