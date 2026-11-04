<img src="assets/icon.svg" width="64" height="64" alt="">

# SparkBot

Created in [T3 Code](https://t3.codes).

Registration checks unlinked members for similar names before inserting. A private,
15-minute confirmation lets the user link an existing record or create a new one.
Linking preserves the existing name, hours and relationships; the Discord server
nickname uses the submitted name (with surrounding whitespace removed).

Registration also requires applying `migrations/0005_registration_roles.sql` to
add the Discord role ID columns, followed by
`migrations/0006_registration_role_ids.sql` to configure the registration roles.
Apply `migrations/0007_country_and_chapter_roles.sql` to create the country
role mappings, relate chapters to countries, and configure chapter roles.
Set
`TICKET_CATEGORY_ID`, `TICKET_ADMIN_ROLE_ID`, `EXECUTIVE_ROLE_ID`,
`CHAPTER_LEAD_ROLE_ID`, and `CHAPTER_VICE_LEAD_ROLE_ID` in the Worker
environment. Ticket lifecycle state is held by the ticket message callbacks;
individual tickets are not stored in D1.

Apply the registration-role migration to local development with:
`npx wrangler d1 migrations apply spark_org_data --local --persist-to .wrangler/local-d1`
and apply it to the deployed database with `--remote`.

Before deploying this change, apply `migrations/0003_registration_confirmation.sql`
through your D1 migration workflow. Its unique Discord-ID index intentionally fails
if existing rows share a non-null Discord ID. Check those conflicts first:

```sql
SELECT discord_id, COUNT(*) FROM members
WHERE discord_id IS NOT NULL
GROUP BY discord_id HAVING COUNT(*) > 1;
```

Matching currently scans unlinked member names and offers the best 24 candidates,
with chapter used to rank ties. It does not merge existing duplicates automatically.

## Website deployment announcements

`POST /webhooks/cloudflare/pages` accepts Cloudflare generic webhook alerts and
posts to **#tech** (`1334032077955268679`) using the existing `DISCORD_TOKEN`.
The message is authored by Spark itself. Spark needs View Channel and Send Messages
in that channel. No Discord incoming webhook is used.

Webhook routes and slash commands are discovered from `src/webhooks` and
`src/slashcommands`. A webhook module exports a default object with a `pathname`
and `handler` (typed with `Webhook` from `src/webhooks/types.ts`); adding one
does not require editing `src/index.ts`. The generated
`src/generated/registry.ts` is the static registry used by the Worker and command
registration script.

`src/generated/databaseSchema.ts` is generated from a schema-only export of the
remote D1 database configured in `wrangler.toml`; `Database` derives its row
types from that file. The pre-commit hook regenerates and stages both generated
files, and `npm run generate` can also be run manually. Generation requires
Wrangler to be installed and authenticated to an account with access to that D1
database. It intentionally fails rather than keeping stale types if the export
cannot be fetched. Run `npm run generate` with Node or `bun run generate:bun`
with Bun to regenerate manually.

Slash commands are published to Discord automatically by the pre-commit hook.
It uses Bun when available, otherwise Node/npm, to refresh the generated
registry and database types, then bulk-overwrite the configured Discord
application command set. Commits require either Bun or Node.js 22+/npm, Wrangler
access to the remote D1 database, network access, and `DISCORD_APPLICATION_ID`
and `DISCORD_TOKEN` in the environment or in the ignored `.env` file. The hook
uses the production app credentials and Discord's global application-command
endpoint; if registration fails, the commit is stopped.

Use `npm run deploy` and `npm run dev` with Node/npm, or `bun run deploy:bun`
and `bun run dev:bun` with Bun. The standard test script uses Node's test
runner; `bun run test:bun` runs Bun's test runner instead.

## Local bot development

Use a separate Discord application/bot for local testing. Keep production
`DISCORD_APPLICATION_ID`, `DISCORD_TOKEN`, and `DISCORD_PUBLIC_KEY` unchanged
in `.env`, and add the development application's credentials separately:

```dotenv
LOCAL_DISCORD_APPLICATION_ID=your-development-application-id
LOCAL_DISCORD_TOKEN=your-development-bot-token
LOCAL_DISCORD_PUBLIC_KEY=your-development-public-key
```

`npm run dev` (or `bun run dev:bun`) automatically registers the commands to the
local Discord application, writes its credentials to the ignored `.dev.vars`
file, then starts Wrangler in local mode. Wrangler uses a local D1 database
persisted under the ignored `.wrangler/local-d1` directory. Local database
writes stay local and do not sync to Cloudflare. Starting dev does not overwrite
an existing local database.

To replace the local database with a fresh snapshot of remote D1, run
`npm run db:refresh-local` or `bun run db:refresh-local:bun`. This downloads
the current database data and schema into ignored `.wrangler` storage, replacing
the local copy. It requires Wrangler authentication and access to remote D1.
Do this before starting local development when you want up-to-date data; it
overwrites local-only database changes. The downloaded data may contain private
member information, so keep the ignored `.wrangler` directory private.

For Discord to send test interactions to your machine, expose the local Worker
over HTTPS. `npm run dev` and `bun run dev:bun` automatically start a temporary
Cloudflare Quick Tunnel. When Wrangler prints its URL, the dev script copies it
to the clipboard and opens the local Discord app's Developer Portal information
page. Paste the URL into **Interactions Endpoint URL** and save. This URL is
temporary and changes when you restart dev, so repeat the paste after restarting.

For a stable URL, a custom domain and named Cloudflare Tunnel are required; a
`pages.dev` hostname cannot be used to create your own stable subdomain. With
only a `pages.dev` domain, use the automatically opened portal and copied
temporary URL each time you restart. Keep the development application separate
from production. The production application already has its own public Worker
URL configured; Discord sends interactions to the endpoint configured for each
application, not to local and remote simultaneously.

Git hooks are enabled by the package `prepare` script. If hooks are not active
after installing dependencies, run `npm run prepare` in the repository.

Before enabling the alert:

1. Apply `0004_deployment_notifications.sql` using
   `npx wrangler d1 migrations apply spark_org_data --remote` (or `bunx wrangler`
   with Bun).
2. Set `CLOUDFLARE_WEBHOOK_SECRET` as a Worker secret (dashboard Settings →
   Variables and Secrets, or `npx wrangler secret put CLOUDFLARE_WEBHOOK_SECRET`
   or `bunx wrangler secret put CLOUDFLARE_WEBHOOK_SECRET` with Bun).
   Enter the same value privately into the Cloudflare webhook destination's Secret
   field. Never commit it. The local development script preserves unrelated
   values already present in ignored `.dev.vars`.
3. Deploy with `npm run deploy`.
4. Under Cloudflare **Alerts → Destinations**, create a **generic webhook** using
   `https://discordbot.officialsparkstem.workers.dev/webhooks/cloudflare/pages`
   and that secret.
   Save and Test should return `test_received`; it deliberately does not post to Discord.
5. Under **Alerts → Platform Notifications**, create a **Pages / Project updates**
   policy filtered to project `spark-stem`, environment **production**, event
   **Deployment success**, delivered to the new generic webhook destination.
6. Copy that policy's ID from its dashboard URL and set
   `CLOUDFLARE_PAGES_POLICY_ID` as another Worker secret using
   `npx wrangler secret put CLOUDFLARE_PAGES_POLICY_ID` (`bunx wrangler` with Bun).
   The ID is not sensitive;
   storing it as a secret keeps deployment-specific settings outside source.
7. On the next successful production deployment, confirm Spark's message in #tech.
   After verifying it, remove the old Discord webhook destination from this alert
   to stop Captain Hook's duplicate announcements.

The policy filters determine which deployments are announced; the Worker pins the
policy ID and rejects other alert types. It forwards Cloudflare's notification text
without depending on undocumented Pages-specific payload fields. Production alerts
must include the documented `policy_id`, `ts`, and `text` envelope fields.

D1 records successful deliveries and uses a one-minute lease to prevent concurrent
requests from sending twice. Discord's deterministic nonce also suppresses recent
duplicate sends if the Discord call succeeds but recording delivery fails. This is
not an absolute exactly-once guarantee: Discord only checks nonce uniqueness for a
few minutes. Failed sends return 502, release the lease, and can be retried; in-flight
duplicates return 503. There is no separate durable retry queue, so check Cloudflare
alert history for failures and retry as needed. Message content is capped at 2,000
characters and disables all mentions.

References: [Cloudflare generic webhooks](https://developers.cloudflare.com/notifications/get-started/configure-webhooks/),
[payload schema](https://developers.cloudflare.com/notifications/reference/webhook-payload-schema/),
[Discord Create Message](https://docs.discord.com/developers/resources/message#create-message).

### Executive database browser

Use `/database table:<name>` on the test bot or deployed bot. Every response is
 ephemeral and every interaction checks the executive role (`EXECUTIVE_ROLE_ID`,
 falling back to the existing executive role ID used by the other commands).

- Autocomplete uses `databaseTables` in `src/generated/databaseSchema.ts`, refreshed
  by the existing generation step on dev/deploy. Pure junction tables (two or more
  foreign-key relationships, with every column a foreign-key column) are omitted.
  Current exclusions are `member_roles` and `session_members`.
- The overview displays eight rows and four columns at a time. Back/Next navigate
  rows; the column buttons expose the rest of wide tables. Filter changes visible
  columns using modal checkboxes. Select accepts the primary key (a JSON array for
  composite keys) and shows full row text across bounded pages.
- Find performs case-insensitive substring matching on the selected column. A
  single match opens directly; Back returns to the search results. Clear search
  restores the full table. SQLite's built-in case folding is ASCII-oriented.
- Add/Edit collect up to five fields per modal. Continue opens the next step;
  Cancel discards the draft. Only the final submission writes the row. Generated
  columns and automatic integer IDs are omitted; primary keys cannot be edited.
- Blank Add fields use database defaults (or NULL for optional columns). Blank
  Edit fields preserve their existing values. `NULL` explicitly clears a nullable
  field; `EMPTY` stores empty text. Prefix literal `NULL`, `EMPTY`, or a leading
  backslash with a backslash. Numeric fields are validated before writing.
- Discord limits input values to 4,000 characters. Longer existing values are
  displayed in full in the row view and left blank in edit forms; leaving them
  blank preserves them. Binary values require the database editor. Find supports
  up to 25 columns and Filter up to 50 columns per table.
- Delete requires a separate confirmation. Edit/Delete check the original row
  values so concurrent changes are not silently overwritten. Reopen `/database`
  after a conflict or expired session.

Session state and unfinished drafts are stored in the private
`_spark_database_sessions` D1 table, created on first use. Sessions are scoped to
user and guild, expire after one hour of inactivity, and expired entries are
cleaned up when a browser is opened. Internal `_spark_` tables never appear in
schema generation or autocomplete. No additional binding or secret is needed.

For local testing, run `bunx wrangler login`, `bun db:refresh-local`, then
`npm run dev`. Paste the copied tunnel URL into the **test application's**
Interactions Endpoint URL in the Discord developer portal and save it. The dev
script registers commands on the test application and uses only local D1. Restart
dev and update the endpoint when the one-hour tunnel expires.

Run `npm test` for SQLite-backed interaction tests and `npm run typecheck` for
TypeScript validation. Tests use disposable databases and do not touch remote D1.
