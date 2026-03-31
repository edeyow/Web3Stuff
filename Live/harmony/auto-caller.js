// Harmony WL Auto-Caller — Paste in console on the call page
// 1. Open https://harmony-webrtc-7684.twil.io/call.html
// 2. F12 → Console → Paste this → Enter
// 3. Panel appears → Start

(() => {
  const NUMBERS = ["6287853231972", "628113395868", "6285156723817"];
  const DIGIT_DELAY = 10000;  // 10s between digit steps
  const NUMBER_DELAY = 15000; // 15s between numbers
  const MAX_ROUNDS = 10;      // 0 = infinite

  let running = false;
  let currentCall = null;
  let totalAttempts = 0;
  let successCount = 0;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // UI Panel
  const panel = document.createElement("div");
  panel.style.cssText = "position:fixed;top:12px;right:12px;z-index:100000;background:#1a1a2e;border:1px solid #3D5CFF;border-radius:12px;padding:18px;width:380px;font-family:monospace;color:#e0e0e0;box-shadow:0 0 30px rgba(61,92,255,0.15);max-height:90vh;overflow-y:auto";
  panel.innerHTML = `
    <div style="font-size:14px;font-weight:bold;color:#3D5CFF;margin-bottom:12px">📞 Harmony Auto-Caller</div>
    <div id="hc-status" style="font-size:11px;color:#888;margin-bottom:8px">${NUMBERS.length} numbers loaded | ${DIGIT_DELAY/1000}s digit delay | max ${MAX_ROUNDS} rounds</div>
    <div id="hc-progress" style="margin-bottom:8px"></div>
    <div id="hc-log" style="font-size:11px;max-height:250px;overflow-y:auto;border:1px solid #222;border-radius:8px;padding:8px;margin-bottom:12px;background:#0a0a14;line-height:1.7;display:none"></div>
    <div style="display:flex;gap:8px">
      <button id="hc-start" style="flex:1;padding:10px;border:none;border-radius:8px;background:#3D5CFF;color:#fff;font-weight:bold;cursor:pointer;font-size:13px;font-family:monospace">▶ Start</button>
      <button id="hc-stop" style="flex:1;padding:10px;border:none;border-radius:8px;background:#c0392b;color:#fff;font-weight:bold;cursor:pointer;font-size:13px;font-family:monospace;display:none">⏹ Stop</button>
    </div>
  `;
  document.body.appendChild(panel);

  function log(msg, color = "#888") {
    const el = document.getElementById("hc-log");
    el.style.display = "block";
    const d = document.createElement("div");
    d.style.color = color;
    d.textContent = `${new Date().toLocaleTimeString()} ${msg}`;
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
  }

  function setStatus(s) {
    document.getElementById("hc-status").textContent = s;
  }

  function setProgress(cur, total) {
    const el = document.getElementById("hc-progress");
    if (!total) { el.innerHTML = ""; return; }
    const pct = Math.round((cur / total) * 100);
    el.innerHTML = `<div style="background:#111;border-radius:4px;overflow:hidden;height:8px">
      <div style="background:linear-gradient(90deg,#3D5CFF,#27ae60);height:100%;width:${pct}%;transition:width 0.4s"></div>
    </div><div style="text-align:center;margin-top:4px;font-size:11px;color:#555">${cur}/${total} attempts</div>`;
  }

  async function getToken() {
    const res = await fetch("/token");
    const data = await res.json();
    return data.token;
  }

  async function makeCall(phoneNumber) {
    const short = phoneNumber.slice(0, 4) + "..." + phoneNumber.slice(-4);

    return new Promise(async (resolve) => {
      let completed = false;
      const timeout = setTimeout(() => {
        if (!completed) {
          log(`${short} — timed out`, "#c0392b");
          completed = true;
          try { currentCall?.disconnect(); } catch {}
          resolve(false);
        }
      }, 120000);

      try {
        log(`${short} — getting token...`, "#888");
        const token = await getToken();

        const device = new Twilio.Device(token, {
          codecPreferences: ["opus", "pcmu"],
        });

        await device.register();

        currentCall = await device.connect();

        currentCall.on("accept", async () => {
          log(`${short} — connected, starting sequence`, "#3D5CFF");

          try {
            // Wait for greeting
            log(`${short} — waiting for greeting...`, "#888");
            await sleep(DIGIT_DELAY);
            if (!running) throw new Error("stopped");

            // Press 3
            log(`${short} — pressing 3`, "#fff");
            currentCall.sendDigits("3");
            await sleep(DIGIT_DELAY);
            if (!running) throw new Error("stopped");

            // Press 4
            log(`${short} — pressing 4`, "#fff");
            currentCall.sendDigits("4");
            await sleep(DIGIT_DELAY);
            if (!running) throw new Error("stopped");

            // Enter phone number + *
            log(`${short} — entering number + *`, "#fff");
            currentCall.sendDigits(phoneNumber + "*");
            await sleep(DIGIT_DELAY);
            if (!running) throw new Error("stopped");

            // Press 1 to confirm
            log(`${short} — pressing 1 (confirm)`, "#fff");
            currentCall.sendDigits("1");
            await sleep(5000);

            log(`${short} — ✓ sequence complete`, "#27ae60");
            successCount++;
            completed = true;
            clearTimeout(timeout);
            currentCall.disconnect();
            device.destroy();
            resolve(true);

          } catch (e) {
            if (e.message === "stopped") {
              log(`${short} — stopped by user`, "#c0392b");
            } else {
              log(`${short} — ✗ ${e.message}`, "#c0392b");
            }
            completed = true;
            clearTimeout(timeout);
            try { currentCall.disconnect(); } catch {}
            device.destroy();
            resolve(false);
          }
        });

        currentCall.on("disconnect", () => {
          if (!completed) {
            log(`${short} — disconnected early`, "#c0392b");
            completed = true;
            clearTimeout(timeout);
            device.destroy();
            resolve(false);
          }
        });

        currentCall.on("error", (err) => {
          log(`${short} — ✗ ${err.message}`, "#c0392b");
          if (!completed) {
            completed = true;
            clearTimeout(timeout);
            device.destroy();
            resolve(false);
          }
        });

      } catch (e) {
        log(`${short} — ✗ ${e.message}`, "#c0392b");
        completed = true;
        clearTimeout(timeout);
        resolve(false);
      }
    });
  }

  async function startCalling() {
    running = true;
    totalAttempts = 0;
    successCount = 0;
    document.getElementById("hc-start").style.display = "none";
    document.getElementById("hc-stop").style.display = "block";

    log(`Starting — ${NUMBERS.length} numbers, ${MAX_ROUNDS} rounds`, "#3D5CFF");

    const totalCalls = NUMBERS.length * MAX_ROUNDS;

    for (let round = 1; (MAX_ROUNDS === 0 || round <= MAX_ROUNDS) && running; round++) {
      log(`\n═══ Round ${round}/${MAX_ROUNDS || "∞"} ═══`, "#3D5CFF");

      for (let i = 0; i < NUMBERS.length && running; i++) {
        totalAttempts++;
        setStatus(`Round ${round} | Number ${i + 1}/${NUMBERS.length} | Total: ${totalAttempts}`);
        setProgress(totalAttempts, totalCalls);

        await makeCall(NUMBERS[i]);

        if (i < NUMBERS.length - 1 && running) {
          log(`Waiting ${NUMBER_DELAY / 1000}s...`, "#555");
          await sleep(NUMBER_DELAY);
        }
      }

      if (running && (MAX_ROUNDS === 0 || round < MAX_ROUNDS)) {
        log(`Round ${round} done. Next round in ${NUMBER_DELAY / 1000}s...`, "#888");
        await sleep(NUMBER_DELAY);
      }
    }

    running = false;
    log(`\n═══ DONE: ${totalAttempts} attempts, ${successCount} completed ═══`, "#27ae60");
    setStatus(`Done! ${successCount}/${totalAttempts} completed`);
    document.getElementById("hc-start").style.display = "block";
    document.getElementById("hc-stop").style.display = "none";
  }

  document.getElementById("hc-start").onclick = startCalling;
  document.getElementById("hc-stop").onclick = () => {
    running = false;
    try { currentCall?.disconnect(); } catch {}
    log("Stopping...", "#c0392b");
  };
})();
