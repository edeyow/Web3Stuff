# @tmm_eth — Take My Muffin Bulk Register

Bracket-style tournament quiz + social tasks. Full automation: SIWE wallet auth → tournament completion → AdFather task completion.

**What it automates:**
- Wallet generation + SIWE authentication
- 7-match tournament (Quarter → Semi → Final)
- 10 social tasks via AdFather SDK (zero real verification)
- 500 points per wallet

## Usage
```bash
node bulk-register.mjs [count] [referral_code]
node bulk-register.mjs 10 cj1laUY4QXBT
```

~30s per wallet. Saves keys + results to `tmm-wallets.json`.

**Note:** Referral tracking via API doesn't work — referrals only count through the website UI.
