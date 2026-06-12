# Founder kit — register the "Archon for Mantle" GitHub App (~3 minutes)

The entire server side is deployed and inert until these credentials exist. Nothing else needs code changes.

## 1. Create the App

GitHub → Settings → Developer settings → GitHub Apps → **New GitHub App**:

- **Name:** `Archon for Mantle`
- **Homepage URL:** `https://archonaudit.xyz`
- **Webhook URL:** `https://archonaudit.xyz/api/github/webhook`
- **Webhook secret:** generate one (`openssl rand -hex 24`) — you'll reuse it below.
- **Permissions (Repository):** Checks **Read & write** · Contents **Read & write** · Pull requests **Read & write** · Issues **Read & write** · Metadata **Read-only**
- **Subscribe to events:** `Pull request`, `Issue comment`, `Installation`
- **Where can it be installed:** Any account

Create, then on the App page: note the **App ID** and **Generate a private key** (downloads a `.pem`).

## 2. Configure the server

Append to `/root/.openclaw/workspace/projects/Archon/.env.local`:

```bash
GITHUB_APP_ID=<app id>
GITHUB_WEBHOOK_SECRET=<the secret from step 1>
# single line, newlines escaped:
GITHUB_APP_PRIVATE_KEY="$(awk 'NF {printf "%s\\n", $0}' ~/Downloads/archon-for-mantle.*.pem)"
```

Then `pm2 restart ecosystem.config.cjs --update-env`. Verify: `curl https://archonaudit.xyz/api/providers` → `integrations.githubApp.status: "active"`.

## 3. Demo (the README gif)

1. Install the App on `Franlinozz/archon-gas-action-demo`.
2. Open a PR introducing a reentrancy + an uncached storage read in a loop → the **Archon / Mantle audit + gas** check fails, one comment shows findings + gas diff + autofix offers.
3. Comment `/archon fix <id>` from the offer list → Archon opens `archon/fix-…` with the compile-validated patch.
4. Merge it → push to the PR → check goes green. Record ~30s.

Delete the downloaded `.pem` after the key is in `.env.local`. Never commit it.
