import { DiscordRestClient } from "../src/discordBS/rest/client.ts";
import { commandDefinitions } from "../src/handler/commands.ts";

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
  const client = new DiscordRestClient({ DISCORD_TOKEN: token }, []);
  await client.request("PUT", `/applications/${applicationId}/commands`, JSON.stringify(commandDefinitions));
  console.log(`Registered ${commandDefinitions.length} ${isLocal ? "local " : ""}slash commands.`);
} catch (error) {
  console.error("Failed to register slash commands:", error);
  process.exit(1);
}
