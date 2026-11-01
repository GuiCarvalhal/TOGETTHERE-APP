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

## Inbox connectors (Gmail + Outlook.com)

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
| `INBOX_CREDENTIALS_KEY` *(optional)* | AES-GCM key material for the iCloud/Yahoo app passwords stored on `InboxConnection`. Falls back to `RESERVATION_INBOX_TOKEN` when unset. |

### OAuth app setup

1. **Google** — Cloud Console → APIs & Services → enable **Gmail API** → Credentials → Create OAuth client ID → **Web application**.
   Authorized redirect URI: `https://<your app domain>/functions/completeInboxOAuth`
   (register it once per domain users sign in from: the `base44.app` host and any custom domain).
2. **Microsoft** — Entra admin center → App registrations → New registration → "Accounts in any organizational directory and personal Microsoft accounts".
   Redirect URI (platform: **Web**): `https://<your app domain>/functions/completeInboxOAuth`
   API permissions → Microsoft Graph → Delegated → `Mail.Read`, `User.Read`, `offline_access`. Then Certificates & secrets → new client secret.
3. Paste the four values (plus the optional URLs) into the dashboard **Secrets** page.

Both providers require the callback to be an exact string match; if you set
`INBOX_OAUTH_CALLBACK_URL`, it must be identical in the provider console.

### iCloud & Yahoo (IMAP, app passwords)

No OAuth app registration is needed for these two: each user connects with an
**app-specific password**, which is verified against the real IMAP server,
encrypted with AES-GCM, and stored on their own `InboxConnection` record
(admin-only RLS; never returned to the client).

| Provider | IMAP host | Port | Prerequisite |
| --- | --- | --- | --- |
| iCloud Mail | `imap.mail.me.com` | `993` (TLS) | Apple ID → **Sign-In and Security → App-Specific Passwords**. Two-factor authentication must be on; the normal Apple ID password is rejected. |
| Yahoo Mail | `imap.mail.yahoo.com` | `993` (TLS) | Account Security → **Generate app password** (required while two-step verification is on). |

- Connect from **Account → Inbox connectors → iCloud Mail / Yahoo Mail**: enter the
  mailbox address and the app password. `connectImapInbox` runs `LOGIN` + `SELECT INBOX`
  before storing anything, so a bad password fails immediately with a specific message
  (rejected app password, timeout, or mailbox access denied).
- `syncInboxConnections` issues `UID SEARCH`, then `HEADER.FIELDS (SUBJECT FROM TO DATE)`,
  and downloads full bodies only for subject matches. The highest INBOX UID is kept in
  `uid_cursor`, so later syncs fetch strictly newer mail; a first sync falls back to a
  30-day window.
- Source ids are `icloud:<mailbox>:<uid>` and `yahoo:<mailbox>:<uid>`, so re-scans and
  reconnects never duplicate imports.
- Revoking the app password at the provider makes the next sync record "Needs attention";
  disconnect clears the encrypted credential and the UID cursor.

### How syncing works

- Connect from **Account → Inbox connectors**. `startInboxOAuth` mints a single-use state token,
  `completeInboxOAuth` verifies it, exchanges the code, and stores tokens on `InboxConnection`
  (admin-only RLS; tokens never reach the client).
- `syncInboxConnections` scans recent inbox mail (Gmail: last 30 days or after the cursor; Outlook:
  since the cursor), keeps messages whose subject/body match reservation hints (EN + PT), and passes
  each to the shared pipeline. Source ids are prefixed `gmail:` / `outlook:` / `icloud:` / `yahoo:`,
  so re-scans are idempotent.
- Home calls a throttled background sync (10 minutes) for due connections; failures stay silent there
  and surface as "Needs attention" in Account settings.

## Docs & Support

GitHub integration: [https://docs.base44.com/developers/app-code/local-development/github](https://docs.base44.com/developers/app-code/local-development/github)

Local development: [https://docs.base44.com/developers/backend/overview/local-dev/local-development-overview](https://docs.base44.com/developers/backend/overview/local-dev/local-development-overview)

Support: [https://app.base44.com/support](https://app.base44.com/support)