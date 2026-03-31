# @ethernalfluffs — Waitlist Register

NFT/token waitlist with $ETF points. Social tasks (follow + RT) are client-side only — no Twitter API verification.

**Bypass:** Calls `/api/waitlist/register` directly with `followDone: true, retweetDone: true`. Turnstile CAPTCHA solves automatically in a real browser.

## Usage
1. Open `https://www.ethernalfluffs.xyz/waitlist`
2. F12 → Console → paste `register.js` → Enter
3. UI panel appears — paste wallets (`address,handle` per line) + referral code
4. Click Start

Each registration takes ~8-10s (Turnstile solve time).
