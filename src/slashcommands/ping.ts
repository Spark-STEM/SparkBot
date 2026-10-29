import { ApplicationCommandType } from "discord-api-types/v10";
import type { SlashCommand } from "./types.ts";

const command: SlashCommand = {
  name: "ping",
  description: "Measures SparkBot's response time to Discord",
  type: ApplicationCommandType.ChatInput,
  async run(client, interaction) {
    let latency: number | null = null;
    try {
      const startedAt = Date.now();
      const response = await fetch("https://discord.com/api/v10/gateway", {
        signal: AbortSignal.timeout(1_500),
      });
      latency = Date.now() - startedAt;
      await response.body?.cancel();
    } catch (error) {
      console.error("ping command Discord API check failed", error);
    }
    await interaction.reply(latency === null ? "🏓 pong: unavailable" : `🏓 pong: ${latency}ms`);
  },
};

export default command;
