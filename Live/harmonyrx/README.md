# Harmony — Auto-Caller for WL

**X:** Project uses Twilio WebRTC — no public X account identified

Twilio WebRTC phone call automation for an NFT whitelist disguised as a fake pharma support line. Navigates the phone menu and enters your number automatically.

**Requires a real browser** (WebRTC needs audio stack). Cannot run headless.

## Usage
1. Open `https://harmony-webrtc-7684.twil.io/call.html`
2. F12 → Console → paste `auto-caller.js` → Enter
3. Panel appears → click Start

Cycles through hardcoded phone numbers, presses DTMF digits (3 → 4 → phone+* → 1), repeats.

Edit the `NUMBERS` array at the top of the script to change phone numbers.
