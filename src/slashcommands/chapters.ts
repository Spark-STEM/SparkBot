import { ApplicationCommandType } from "discord-api-types/v10";
import { EmbedBuilder } from "../discordBS/builders/embed.ts";
import type { SlashCommand } from "./types.ts";

const command: SlashCommand = {
  name: "chapters",
  description: "Lists active chapters from the database",
  type: ApplicationCommandType.ChatInput,
  async run(client, interaction) {
    try {
      const results = await client.env.database.select("chapters", {
        columns: ["id", "name", "city", "region", "country"],
        orderBy: "country",
        limit: 10,
      }).all();
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle(`Active Chapters (${results.length})`)
          .setDescription(results.length
            ? results.map((chapter) => `**${chapter.name || chapter.city}** — ${[chapter.city, chapter.region, chapter.country].filter(Boolean).join(", ")}`).join("\n")
            : "No chapters found in the database yet.")
          .setColor(0x57f287)],
      });
    } catch (error) {
      console.error("chapters command failed", error);
      await interaction.reply("❌ Unable to retrieve chapters.");
    }
  },
};

export default command;
