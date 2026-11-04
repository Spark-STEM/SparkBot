import { ApplicationCommandType } from "discord-api-types/v10";
import { EmbedBuilder } from "../discordBS/builders/embed.ts";
import type { SlashCommand } from "./types.ts";

const command: SlashCommand = {
  name: "chapters",
  description: "Lists active chapters from the database",
  type: ApplicationCommandType.ChatInput,
  async run(client, interaction) {
    try {
      const results = await client.env.database.query<{
        id: number;
        name: string | null;
        city: string;
        region: string | null;
        country: string;
      }>(
        `SELECT chapters.id, chapters.name, chapters.city, regions.name AS region, chapters.country
         FROM chapters
         LEFT JOIN regions ON regions.id = chapters.region_id
         ORDER BY chapters.country
         LIMIT 10`,
      ).all();
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
