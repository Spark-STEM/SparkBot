import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "../slashcommands");

async function files(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await files(path));
    else if (path.endsWith(".ts") || path.endsWith(".js")) found.push(path);
  }
  return found;
}

export async function loadCommandDefinitions() {
  const loaded = await Promise.all((await files(root)).map(async (path) => {
    const module = await import(pathToFileURL(path).href);
    return module.default?.name && module.default?.description ? module.default : null;
  }));
  return loaded.filter(Boolean).map(({ run: _run, ...command }) => command);
}

export async function registerCommands(): Promise<void> {
  const applicationId = process.env.DISCORD_APPLICATION_ID;
  const token = process.env.DISCORD_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!applicationId || !token) throw new Error("DISCORD_APPLICATION_ID and DISCORD_TOKEN are required");
  const endpoint = guildId
    ? `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`
    : `https://discord.com/api/v10/applications/${applicationId}/commands`;
  const definitions = await loadCommandDefinitions();
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(definitions),
  });
  if (!response.ok) throw new Error(`Discord API returned ${response.status}: ${await response.text()}`);
  console.log(`Registered ${definitions.length} slash commands from ${relative(process.cwd(), root)}${sep}.`);
}
