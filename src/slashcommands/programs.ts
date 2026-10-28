import { ApplicationCommandType } from "discord-api-types/v10";
import { EmbedBuilder } from "../discordBS/builders/embed.ts";
import type { SlashCommand } from "./types.ts";

const command: SlashCommand = {
    name: "programs",
    description: "Lists active programs and partner schools",
    type: ApplicationCommandType.ChatInput,
    async run(client, interaction) {
        try {
                const results = await client.env.database.query<{
                    id: number; program_name: string; status: string; school_name: string | null;
                }>(
                    `SELECT p.id, p.name as program_name, p.status, s.name as school_name
             FROM programs p LEFT JOIN schools s ON p.school_id = s.id
             ORDER BY p.id DESC LIMIT 10`,
                ).all();
            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle("Recent Programs")
                    .setDescription(results.length
                        ? results.map((program) => `**${program.program_name}** at *${program.school_name || "Unknown School"}* [Status: \`${program.status}\`]`).join("\n")
                        : "No programs found in the database yet.")
                    .setColor(0xfee75c)],
            });
        } catch (error) {
            console.error("programs command failed", error);
            await interaction.reply("❌ Unable to retrieve programs.");
        }
    },
};

export default command;
