# @getmarkit — Waitlist Register + Site Monitor

**X:** [https://x.com/getmarkit](https://x.com/getmarkit)

555 NFT collection waitlist. Originally had zero Supabase RLS (direct API inserts). They've since upgraded security — monitor watches for form re-opening.

## Scripts

### register.js (Node.js)
Watcher + batch register. Three modes:
```bash
node register.js status              # Check site & DB status
node register.js watch wallets.csv   # Monitor until WL opens, then auto-register
node register.js fire wallets.csv    # Register immediately
```
CSV format: `0xaddress,@xhandle,email@domain.com`

### watcher.js (Node.js)
Monitors the site for deploy changes and sends Discord webhook alerts.
```bash
DISCORD_WEBHOOK="https://discord.com/api/webhooks/..." node watcher.js
```
Polls every 2 minutes, alerts on Vercel deploy ID change.
