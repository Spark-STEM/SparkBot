import { COMMANDS } from "../src/commands/index.ts";

/**
 * Script to register Discord slash commands via Discord REST API.
 * Usage:
 *   bun run scripts/register-commands.ts
 *
 * Environment variables:
 *   DISCORD_APPLICATION_ID (required)
 *   DISCORD_TOKEN (required)
 *   DISCORD_GUILD_ID (optional - if provided, updates commands instantly for that server)
 */

const applicationId = process.env.DISCORD_APPLICATION_ID;
const token = process.env.DISCORD_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;

if (!applicationId || !token) {
  console.error("❌ Missing required environment variables!");
  console.error("Please set DISCORD_APPLICATION_ID and DISCORD_TOKEN in .env or your environment.");
  process.exit(1);
}

const endpoint = guildId
  ? `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`
  : `https://discord.com/api/v10/applications/${applicationId}/commands`;

console.log(`Registering ${COMMANDS.length} commands to: ${endpoint}`);

try {
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(COMMANDS),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Discord API returned ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as Array<{ name: string; description: string }>;
  console.log("✅ Successfully registered slash commands:");
  console.log(data.map((c) => ` • /${c.name}: ${c.description}`).join("\n"));
} catch (error) {
  console.error("❌ Failed to register commands:", error);
  process.exit(1);
}
