import { ApplicationCommandType } from "discord-api-types/v10";
import { EmbedBuilder } from "../discordBS/builders/embed.ts";
import type { SlashCommand } from "./types.ts";

const command: SlashCommand = {
  name: "stats",
  description: "Displays summary statistics from the Spark organization database",
  type: ApplicationCommandType.ChatInput,
  async run(client, interaction) {
    try {
      const database = client.env.database;
      const [chapters, schools, programs, members] = await Promise.all([
        database.count("chapters"),
        database.count("schools"),
        database.count("programs"),
        database.count("members"),
      ]);
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle("Spark Organization Overview")
          .setDescription([
            `**Chapters:** ${chapters}`,
            `**Schools:** ${schools}`,
            `**Programs:** ${programs}`,
            `**Members:** ${members}`,
          ].join("\n"))
          .setColor(0x5865f2)],
      });
    } catch (error) {
      console.error("stats command failed", error);
      await interaction.reply("❌ Unable to retrieve organization statistics.");
    }
  },
};

export default command;
