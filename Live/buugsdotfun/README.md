# @buugsdotfun — Wallet Drop Bypass

Hex grid puzzle game. After winning, a wallet submission modal appears with social tasks checkbox. The checkbox is client-side only, and the Supabase RPC function accepts wallets directly.

**Bypass:** Calls `submit_wallet_submission` RPC directly — no game, no social tasks.

## Usage
1. Open `https://wallet.buugs.fun`
2. F12 → Console → paste `register.js` → Enter
3. Panel appears — paste wallet addresses (one per line)
4. Click Drop Wallets

Detects duplicates (409). 1-2.5s random delay between entries.
