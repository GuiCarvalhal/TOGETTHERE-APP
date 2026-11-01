# Base44 Project

Use this repository to run and edit the app locally, then publish changes back through Base44.

Any change pushed to the repo will also be reflected in the Base44 Builder.

## Prerequisites

1. Clone the repository using the project's Git URL.
2. Navigate to the project directory.
3. Install dependencies: `npm install`.
4. Install the Base44 CLI: `npm install -g base44@latest`.
5. Install [Deno](https://docs.deno.com/runtime/getting_started/installation/) ??? the local Base44 backend runs on it.

Run `base44 --help` (or see the [CLI reference](https://docs.base44.com/developers/references/cli/commands/introduction)) for the full command surface.

## Run Locally

Three commands, from the project root:

```bash
base44 login   # one-time per machine
base44 link    # one-time per clone
base44 dev     # local backend + frontend together
```

Open the frontend URL that `base44 dev` prints (typically `http://localhost:5173`).

Notes:

- **Every fresh clone needs `base44 link`.** It writes `base44/.app.jsonc` (the app-id pointer), which is deliberately gitignored. Your app id is in the Builder URL (`app.base44.com/apps/<id>/...`); `base44 link --help` shows the non-interactive flags.
- **`base44 dev` runs the frontend for you** (via `site.serveCommand` in this repo's `base44/config.jsonc`) ??? never run `npm run dev` yourself: alone it serves a UI with no backend behind it (`[base44] Proxy not enabled`, every `/api` call fails), and alongside `base44 dev` the second Vite silently takes the next port and you end up looking at the wrong one.
- **The app must be published at least once for the UI to load under `base44 dev`.** The frontend boots by fetching app settings from the hosted app; before the first publish that fails and every page redirects to login. The local API works regardless.
- Entities, functions, and auth run locally ??? entity data is **in-memory only**, wiped when `base44 dev` restarts. Everything else (Core integrations, OAuth login) is forwarded to your deployed app. Full breakdown: [Local development overview](https://docs.base44.com/developers/backend/overview/local-dev/local-development-overview).

## Frontend Only, Hosted Backend

To work on just the frontend against your app's live hosted backend:

```bash
base44 dev --remote
```

?????? In this mode writes go to your app's **production data** ??? plain `base44 dev` keeps everything local.

## Publish Your Changes

After pushing your changes to git, open the Base44 dashboard and publish the app:

```bash
base44 dashboard open
```

This repo syncs to Base44 through git, so publish from the dashboard rather than `base44 deploy` ??? a CLI deploy ships your local tree directly, bypassing the sync, and the deployed state silently diverges from the repo.

## Automatic reservation import from Microsoft 365 email

This app includes a backend webhook function (`receiveReservationEmail`) that can ingest reservation emails automatically and either:

1. auto-create a `JourneyItem` when a gathering match is confident (date-window scoring), or
2. create a pending import that appears on Home so the user picks the gathering manually.

### 1) Configure secret in Base44

Set a strong shared token in Base44 secrets:

- `RESERVATION_INBOX_TOKEN=<long-random-token>`

`receiveReservationEmail` requires this token in `Authorization: Bearer <token>` or `x-togetthere-token`.

### 2) Build a Power Automate flow (Microsoft 365 mailbox)

Use mailbox `plan@togetthere.app`:

1. Trigger: **When a new email arrives (V3)** (Outlook).
2. Action: **HTTP** (POST) to your Base44 function URL.
3. Headers:
   - `Authorization: Bearer <RESERVATION_INBOX_TOKEN>`
   - `Content-Type: application/json`
4. Body (example):

```json
{
  "messageId": "@{triggerOutputs()?['body/id']}",
  "internetMessageId": "@{triggerOutputs()?['body/internetMessageId']}",
  "subject": "@{triggerOutputs()?['body/subject']}",
  "from": "@{triggerOutputs()?['body/from/emailAddress/address']}",
  "to": "plan@togetthere.app",
  "receivedAt": "@{triggerOutputs()?['body/receivedDateTime']}",
  "bodyText": "@{triggerOutputs()?['body/bodyPreview']}"
}
```

Optional: pass `targetUserEmail` if you want deterministic user routing.

### 3) User resolution and fallback behavior

- If the sender/target email maps to a TOGETTHERE member and the date match is clear, item is created automatically.
- If confidence is low, Home shows a pending import card with a gathering picker and one-click create/discard.

## Inbox connectors (Gmail, Outlook.com, iCloud, Yahoo)

Native mailbox connectors import reservation emails straight into Journey. They
reuse the same ingestion pipeline as `receiveReservationEmail` (`base44/shared/reservationIngestion.ts`),
so there is no second parser to keep in sync.

### Required secrets

| Secret | Purpose |
| --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth **Web application** client for Gmail (`gmail.readonly`). |
| `MICROSOFT_OAUTH_CLIENT_ID` / `MICROSOFT_OAUTH_CLIENT_SECRET` | Microsoft Entra app registration for Outlook.com (`Mail.Read`, `User.Read`, `offline_access`). |
| `INBOX_OAUTH_CALLBACK_URL` *(optional)* | Exact redirect URI registered with the providers. Default: `<app url>/functions/completeInboxOAuth`. |
| `INBOX_OAUTH_SUCCESS_URL` *(optional)* | Where the browser lands after connecting. Default: `<app url>/account`. |
| `YAHOO_OAUTH_CLIENT_ID` / `YAHOO_OAUTH_CLIENT_SECRET` | Yahoo Developer app for Yahoo Mail OAuth (`openid mail-r`), used for the OAuth token and IMAP XOAUTH2 access. |
| `INBOX_CREDENTIALS_KEY` | AES-GCM key material for iCloud app-specific passwords stored on `InboxConnection`. Required for iCloud connections; when unset, the legacy `RESERVATION_INBOX_TOKEN` is used so records written earlier keep decrypting. |
| `INBOX_CREDENTIALS_KEY_PREVIOUS` *(optional)* | The outgoing key during a rotation window. Records it wrote stay readable and are re-encrypted with `INBOX_CREDENTIALS_KEY` on their next sync. |

### OAuth app setup

1. **Google** — Cloud Console → APIs & Services → enable **Gmail API** → Credentials → Create OAuth client ID → **Web application**.
   Authorized redirect URI: `https://<your app domain>/functions/completeInboxOAuth`
   (register it once per domain users sign in from: the `base44.app` host and any custom domain).
2. **Microsoft** — Entra admin center → App registrations → New registration → "Accounts in any organizational directory and personal Microsoft accounts".
   Redirect URI (platform: **Web**): `https://<your app domain>/functions/completeInboxOAuth`
   API permissions → Microsoft Graph → Delegated → `Mail.Read`, `User.Read`, `offline_access`. Then Certificates & secrets → new client secret.
3. **Yahoo** — [Yahoo Developer Network](https://developer.yahoo.com/apps/create/) → Create Application:
   - Application type: **Web Application**
   - **Mail** permission: **Read** (this is the `mail-r` scope the connector requests)
   - **OpenID Connect**: enabled (needed to read the mailbox address from `userinfo`)
   - Redirect URI (exact, no trailing slash): `https://gcarva.base44.app/functions/completeInboxOAuth`
   - Save the **Client ID** (`YAHOO_OAUTH_CLIENT_ID`) and **Client Secret** (`YAHOO_OAUTH_CLIENT_SECRET`).

   Yahoo flow details, for reference: authorization at
   `https://api.login.yahoo.com/oauth2/request_auth` (`scope=openid mail-r`), tokens at
   `https://api.login.yahoo.com/oauth2/get_token`, mailbox address from
   `https://api.login.yahoo.com/openid/v1/userinfo`, and IMAP access over
   `imap.mail.yahoo.com:993` with `AUTHENTICATE XOAUTH2` using the access token.
   Tokens are refreshed automatically; an expired or revoked grant marks the mailbox
   "Needs attention" and asks the user to reconnect.

4. Paste the values (plus the optional URLs) into the dashboard **Secrets** page.

Every provider requires the callback to be an exact string match; if you set
`INBOX_OAUTH_CALLBACK_URL`, it must be identical in all three consoles. Yahoo is
strictest here: a mismatched redirect URI fails at `request_auth`, before any code
is issued.

### iCloud Mail (IMAP, app-specific password)

iCloud keeps the app-password model (Apple has no OAuth for mail). Each user
connects their own **app-specific password**, which is verified against the real
IMAP server and only then stored — AES-GCM encrypted, never logged, never returned
to the client.

| IMAP host | Port | Prerequisite |
| --- | --- | --- |
| `imap.mail.me.com` | `993` (TLS) | Apple ID → **Sign-In and Security → App-Specific Passwords**. Two-factor authentication must be on; the normal Apple ID password is rejected. |

Security model:

- **Encryption at rest.** The password is encrypted with AES-GCM under the dedicated
  `INBOX_CREDENTIALS_KEY`. Ciphertext is tagged with a short fingerprint of the key
  that produced it (`v2:<keyId>:<iv>:<ciphertext>`), so a wrong/rotated key is
  detected instead of producing garbage.
- **Key rotation.** To rotate: copy the current value to
  `INBOX_CREDENTIALS_KEY_PREVIOUS`, set the new value in `INBOX_CREDENTIALS_KEY`.
  Records written by the old key still decrypt (the ring is tried in order: new,
  previous, legacy `RESERVATION_INBOX_TOKEN`), and each one is **re-encrypted with the
  new key on its next sync** — after every mailbox has synced once, the previous key
  can be removed.
- **Clear errors.** Missing key material fails with `credentials_key_missing`; a key
  that no longer matches the stored ciphertext fails with `credentials_key_invalid`
  and the UI says to reconnect. Neither message exposes crypto or server detail.
- **Strict input.** The address must be a valid mailbox address (≤ 254 chars) and the
  password must look like an app-specific token (8–256 chars after stripping spaces);
  a rejection from Apple is reported as a fixed code, never as the server's wording.
- **Disconnect wipes.** Disconnecting clears the encrypted secret, both cursors
  (`sync_cursor`, `uid_cursor`), the sync lease, the next-sync time and the last error,
  so nothing about the mailbox survives on the record.

Behaviour:

- Connect from **Account → Inbox connectors → iCloud Mail**: enter the mailbox address
  and the app password. `connectImapInbox` runs `LOGIN` + `SELECT INBOX` before storing
  anything, so a bad password fails immediately with a specific message (rejected app
  password, timeout, or mailbox access denied).
- `syncInboxConnections` issues `UID SEARCH`, then `HEADER.FIELDS (SUBJECT FROM TO DATE)`,
  and downloads full bodies only for subject matches. The highest INBOX UID is kept in
  `uid_cursor`, so later syncs fetch strictly newer mail; a first sync falls back to a
  30-day window. Source ids are `icloud:<mailbox>:<uid>`.
- Revoking the app password at Apple makes the next sync record "Needs attention".

### Yahoo Mail (IMAP over OAuth 2.0 / XOAUTH2)

Yahoo is OAuth-only — no password is ever collected or stored for it. The browser is
sent to Yahoo, the code is exchanged by `completeInboxOAuth`, and the mailbox is read
over IMAP using `AUTHENTICATE XOAUTH2` with the access token.

- Scopes: `openid mail-r` (read-only mail). `mail-w` is never requested.
- The mailbox address comes from `https://api.login.yahoo.com/openid/v1/userinfo`, so
  the account can be keyed by address (multi-account) and used as the IMAP login name.
  A callback that cannot resolve an address redirects with `inbox=error&reason=missing_account_email`.
- Access tokens are refreshed automatically before expiry (5-minute skew) and the
  rotated refresh token is persisted. An expired or revoked grant marks the mailbox
  "Needs attention" with a fixed message asking the user to reconnect — the provider's
  raw wording is never shown.
- Yahoo needs its `ID` command before authentication; the client sends it up front, then
  answers the SASL continuation and acknowledges a failed exchange before reading the
  final NO.
- Source ids are `yahoo:<mailbox>:<uid>`, so re-scans and reconnects never duplicate
  imports. Disconnect clears both tokens and both cursors.

Prerequisites and the exact callback URL are in **OAuth app setup → Yahoo** above;
`YAHOO_OAUTH_CLIENT_ID` and `YAHOO_OAUTH_CLIENT_SECRET` are the only secrets needed.

### How syncing works

- Connect from **Account → Inbox connectors**. `startInboxOAuth` mints a single-use state token,
  `completeInboxOAuth` verifies it, exchanges the code, and stores tokens on `InboxConnection`
  (admin-only RLS; tokens never reach the client).
- `syncInboxConnections` scans recent inbox mail (Gmail: last 30 days or after the cursor; Outlook:
  since the cursor), keeps messages whose subject/body match reservation hints (EN + PT), and passes
  each to the shared pipeline. Source ids are prefixed `gmail:` / `outlook:` / `icloud:` / `yahoo:`,
  so re-scans are idempotent.
- Home runs one background sync per load, for the most overdue mailbox whose own cadence has
  elapsed. Failures are recorded on the connection ("Needs attention") and shown in Account.

### Multiple accounts per provider

- Identity is (user, provider, address): `account_key` = `<provider>:<address>`. Connecting a
  **second** Gmail/iCloud account adds a second `InboxConnection` row; reconnecting the **same**
  address updates its existing row and keeps its cursors, so nothing is imported twice.
- Rows created before multi-account support have no `account_key`; the next connect matches them by
  address and heals them in place, so existing users keep their tokens, cursors and history.
- Each account owns its cursors, status, last error and cadence, so one broken mailbox never blocks
  the others. `disconnectInboxConnection` accepts `connection_id` (one account) or `provider`
  (every account of that provider, kept for clients that predate multi-account support).

### Sync cadence

- `sync_interval_minutes` is per account and one of **5 / 15 / 30 / 60**; absent means 30.
- A mailbox is due when `last_attempt_at + interval` has elapsed. Failures also consume the window
  (they move `last_attempt_at`), so a broken token is not retried on every page load.
- `sync_started_at` is a 2-minute lease: overlapping jobs (two Home loads, or Home plus Sync now)
  skip a mailbox that is already syncing and report `in_flight` instead of fetching it twice.
- `syncInboxConnections` takes `{ connection_id }` for one account, `{ provider }` for every account
  of a provider, or neither for a batch across all accounts. `force: true` (the **Sync now**
  buttons on Home and in Account) ignores the cadence, never the lease and never a disconnected
  mailbox. It returns `results` per account plus a `summary` (`synced`, `imported`, `skipped`,
  `failed`).
- `updateInboxConnection` changes `sync_interval_minutes` and/or `display_label` for one account.

## Docs & Support

GitHub integration: [https://docs.base44.com/developers/app-code/local-development/github](https://docs.base44.com/developers/app-code/local-development/github)

Local development: [https://docs.base44.com/developers/backend/overview/local-dev/local-development-overview](https://docs.base44.com/developers/backend/overview/local-dev/local-development-overview)

Support: [https://app.base44.com/support](https://app.base44.com/support)