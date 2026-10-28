import { commands } from "../src/generated/registry.ts";

const commandDefinitions = commands.map(({ run: _run, ...definition }) => definition);

try {
  const isLocal = process.argv.includes("--local");
  const isProduction = process.argv.includes("--production");
  if (isLocal === isProduction) {
    throw new Error("Specify exactly one registration target: --local or --production");
  }
  const applicationId = isLocal
    ? process.env.LOCAL_DISCORD_APPLICATION_ID
    : process.env.DISCORD_APPLICATION_ID;
  const token = isLocal ? process.env.LOCAL_DISCORD_TOKEN : process.env.DISCORD_TOKEN;
  if (!applicationId || !token) {
    const prefix = isLocal ? "LOCAL_" : "";
    throw new Error(`${prefix}DISCORD_APPLICATION_ID and ${prefix}DISCORD_TOKEN are required`);
  }
  const endpoint = `https://discord.com/api/v10/applications/${applicationId}/commands`;
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commandDefinitions),
  });
  if (!response.ok) {
    throw new Error(`Discord API returned ${response.status}: ${await response.text()}`);
  }
  console.log(`Registered ${commandDefinitions.length} ${isLocal ? "local " : ""}slash commands.`);
} catch (error) {
  console.error("Failed to register slash commands:", error);
  process.exit(1);
}
