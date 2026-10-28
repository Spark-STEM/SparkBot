import { ApplicationCommandType } from "discord-api-types/v10";
import { EmbedBuilder } from "../discordBS/builders/embed.ts";
import type { SlashCommand } from "./types.ts";

const command: SlashCommand = {
  name: "ping",
  description: "Replies with Pong and confirms the bot is alive!",
  type: ApplicationCommandType.ChatInput,
  async run(client, interaction) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Pong!")
          .setDescription("SparkBot is running smoothly on Cloudflare Edge.")
          .setColor(0x5865f2),
      ],
    });
  },
};

export default command;
