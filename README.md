<img src="assets/icon.svg" width="64" height="64" alt="">

# SparkBot

Created in [T3 Code](https://t3.codes).

Registration checks unlinked members for similar names before inserting. A private,
15-minute confirmation lets the user link an existing record or create a new one.
Linking preserves the existing name, hours and relationships; the Discord server
nickname uses the submitted name (with surrounding whitespace removed).

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

Before enabling the alert:

1. Apply `0004_deployment_notifications.sql` using
   `bunx wrangler d1 migrations apply spark_org_data --remote`.
2. Set `CLOUDFLARE_WEBHOOK_SECRET` as a Worker secret (dashboard Settings →
   Variables and Secrets, or `bunx wrangler secret put CLOUDFLARE_WEBHOOK_SECRET`).
   Enter the same value privately into the Cloudflare webhook destination's Secret
   field. Never commit it. For local development, put it in ignored `.dev.vars`.
3. Deploy with `bun run deploy`.
4. Under Cloudflare **Alerts → Destinations**, create a **generic webhook** using
   `https://discordbot.officialsparkstem.workers.dev/webhooks/cloudflare/pages`
   and that secret.
   Save and Test should return `test_received`; it deliberately does not post to Discord.
5. Under **Alerts → Platform Notifications**, create a **Pages / Project updates**
   policy filtered to project `spark-stem`, environment **production**, event
   **Deployment success**, delivered to the new generic webhook destination.
6. Copy that policy's ID from its dashboard URL and set
   `CLOUDFLARE_PAGES_POLICY_ID` as another Worker secret using
   `bunx wrangler secret put CLOUDFLARE_PAGES_POLICY_ID`. The ID is not sensitive;
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
