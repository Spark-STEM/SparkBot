# SparkBot - Project Guidelines & Documentation

SparkBot is an edge Discord bot built on **Cloudflare Workers** and backed by a **Cloudflare D1** SQLite database (`spark_org_data`). It manages member registration, organization data, and admin tooling for the Spark STEM organization.

---

## 🛠️ Stack & Tooling

- **Runtime & Package Manager**: [Bun](https://bun.sh) (v1.2+)
- **Platform**: Cloudflare Workers (`wrangler.toml`, binding: `SPARK_DB`)
- **Database**: Cloudflare D1 (`spark_org_data`, SQLite)
- **Discord API**: `discord-api-types/v10`, `discord-interactions` (HTTP Interaction Webhook model, no Gateway / WebSocket required)
- **Security**: Ed25519 request signature verification

---

## 🚀 Common Commands

Always use `bun` and `bunx wrangler`:

```bash
# Run tests
bun test

# Typecheck codebase
bun run typecheck     # or `bun check`

# Local development server
bun run dev           # runs `bunx wrangler dev`

# Deploy to Cloudflare Workers
bun run deploy        # runs `bunx wrangler deploy`

# Register slash commands to Discord
bun run register      # runs `scripts/register-commands.ts`

# Execute queries directly on remote D1 database
bunx wrangler d1 execute spark_org_data --remote --command "SELECT * FROM chapters;"

# Tail live worker logs
bunx wrangler tail
```

---

## 📂 Project Architecture

```
SparkBot/
├── src/
│   ├── index.ts                # Worker fetch entrypoint, Ed25519 verification, interaction router
│   ├── types.ts                # Env interface, D1 bindings, domain models (Member, Chapter)
│   ├── verify.ts               # Pure Ed25519 request signature validator
│   ├── services/
│   │   ├── member.ts           # Name normalization ("First L.") & D1 member registration
│   │   ├── sql.ts              # SQL query mutation analysis, execution & Discord table formatting
│   │   ├── permissions.ts      # Multi-tier admin checks (Discord Administrator bit, env IDs, DB roles)
│   │   └── discord-client.ts   # Discord REST API client (e.g., auto-renaming member nicknames)
│   └── commands/
│       ├── index.ts            # Command list definitions & slash command router
│       ├── register.ts         # /register command: builds dynamic modal from D1 chapters
│       ├── sql.ts              # /sql command: admin database query executor with mutation warnings
│       └── modal-handlers.ts   # InteractionType.ModalSubmit parser & handler
├── scripts/
│   └── register-commands.ts    # REST script to sync slash commands to Discord application/guild
├── migrations/
│   ├── 0001_initial.sql        # Base schema for all tables
│   └── 0002_add_discord_id.sql # Migration adding discord_id to members
├── tests/
│   ├── verify.test.ts          # Ed25519 signature verification tests
│   ├── member.test.ts          # Name normalization & validation tests
│   ├── sql.test.ts             # Mutation detection & output formatting tests
│   ├── permissions.test.ts     # Permission and admin check tests
│   └── modal.test.ts           # Modal component value extraction tests
├── wrangler.toml               # Cloudflare Worker configuration & D1 bindings
└── .env                        # Local credentials (DISCORD_APPLICATION_ID, DISCORD_TOKEN, DISCORD_GUILD_ID)
```

---

## 🤖 Slash Commands

| Command | Permission | Description |
|---|---|---|
| `/register` | Everyone | Opens a modal prompting for name (`First L.`), chapter (dynamic dropdown from D1), and country. Adds/updates member in D1 and renames Discord server nickname. |
| `/sql` | Admin Only | Runs SQL queries against D1. Detects and displays warnings for mutations (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, etc.). Results are private/ephemeral. |
| `/ping` | Everyone | Worker health check. |
| `/stats` | Everyone | Overview count of chapters, schools, programs, and members. |
| `/chapters`| Everyone | Lists active chapters and regions. |
| `/programs`| Everyone | Lists active programs and partner schools. |

---

## 🔑 Admin Authorization Hierarchy

Admin access for `/sql` is resolved via a 3-tier check in `src/services/permissions.ts`:
1. **Discord Server Permission**: User has the `Administrator` permission bit (`0x8`).
2. **Environment Variable**: User's Discord ID is in `ADMIN_USER_IDS` (comma-separated list).
3. **Database Role**: User has an active role in `member_roles` matching `Admin Team` (ID 2) or `Executive Board` (ID 1).

---

## ⚙️ Environment Secrets & Configuration

Set via `bunx wrangler secret put <NAME>`:
- `DISCORD_PUBLIC_KEY`: Used to verify Ed25519 request signatures from Discord.
- `DISCORD_TOKEN`: Bot token for calling Discord REST APIs (guild member nickname updates).
- `ADMIN_USER_IDS` *(optional)*: Comma-separated list of superadmin Discord user IDs.

Local configuration for command registration (`.env`):
- `DISCORD_APPLICATION_ID`
- `DISCORD_TOKEN`
- `DISCORD_GUILD_ID` *(optional, for instant guild-level command propagation during dev)*

---

## 🧪 Testing Guidelines

- Write tests under `tests/` using Bun's native test runner (`import { describe, it, expect } from "bun:test"`).
- Decouple business logic (parsers, validators, query analyzers) from Discord HTTP interactions so they can be unit-tested without network calls.
- Always verify tests and types before committing:
  ```bash
  bun test && bun check
  ```
