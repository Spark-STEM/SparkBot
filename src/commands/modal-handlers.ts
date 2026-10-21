import {
  InteractionResponseType,
  type APIModalSubmitInteraction,
  type APIInteractionResponse,
} from "discord-api-types/v10";
import type { Env } from "../types.ts";
import { validateAndNormalizeName, registerMemberInDb, getChapters } from "../services/member.ts";
import { updateGuildMemberNickname } from "../services/discord-client.ts";

/**
 * Extracts form field values from a Discord modal submission.
 * Handles nested ActionRows, Labels (type 18), TextInputs, and SelectMenus.
 */
export function extractModalValues(data: { components?: any[] }): Record<string, string> {
  const result: Record<string, string> = {};

  function traverse(item: any) {
    if (!item) return;

    if (item.custom_id) {
      if (Array.isArray(item.values) && item.values.length > 0) {
        result[item.custom_id] = item.values[0];
      } else if (typeof item.value === "string") {
        result[item.custom_id] = item.value;
      }
    }

    if (Array.isArray(item.components)) {
      for (const child of item.components) traverse(child);
    }
    if (item.component) {
      traverse(item.component);
    }
  }

  if (data?.components) {
    for (const c of data.components) traverse(c);
  }

  return result;
}

export async function handleModalSubmit(
  interaction: APIModalSubmitInteraction,
  env: Env
): Promise<APIInteractionResponse> {
  const customId = interaction.data.custom_id;

  if (customId === "spark_register_modal") {
    const values = extractModalValues(interaction.data);
    const rawName = values["name_input"];
    const chapterIdStr = values["chapter_select"];
    const country = values["country_select"] || "United States";

    if (!rawName) {
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: "❌ Error: Name field is required.",
          flags: 64, // Ephemeral
        },
      };
    }

    const validation = validateAndNormalizeName(rawName);
    if (!validation.valid || !validation.normalized) {
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: `❌ Invalid Name: ${validation.error}`,
          flags: 64, // Ephemeral
        },
      };
    }

    const normalizedName = validation.normalized;
    const chapterId = chapterIdStr ? parseInt(chapterIdStr, 10) : 1;

    // Get chapter name for friendly response
    const chapters = await getChapters(env.SPARK_DB);
    const selectedChapter = chapters.find((c) => c.id === chapterId);
    const chapterName = selectedChapter?.name || selectedChapter?.city || `Chapter #${chapterId}`;

    const discordId = interaction.member?.user?.id || interaction.user?.id || null;

    // 1. Save to D1 database
    const dbResult = await registerMemberInDb(env.SPARK_DB, {
      name: normalizedName,
      chapterId,
      discordId,
    });

    if (!dbResult.success) {
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: `❌ Failed to save registration to database: ${dbResult.error}`,
          flags: 64,
        },
      };
    }

    // 2. Auto-rename member in Discord Guild if possible
    let renameNote = "";
    if (interaction.guild_id && discordId && env.DISCORD_TOKEN) {
      const renameResult = await updateGuildMemberNickname({
        guildId: interaction.guild_id,
        userId: discordId,
        nickname: normalizedName,
        botToken: env.DISCORD_TOKEN,
      });

      if (renameResult.success) {
        renameNote = "\n🏷️ Your server nickname was updated to **" + normalizedName + "**.";
      } else {
        renameNote =
          "\n⚠️ *(Could not auto-rename your server nickname: bot requires 'Manage Nicknames' permission and higher role hierarchy)*";
      }
    }

    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: `✅ **Registration Complete!**\n• **Name:** ${normalizedName}\n• **Chapter:** ${chapterName}\n• **Country:** ${country}${renameNote}`,
        flags: 64, // Ephemeral so only the user sees confirmation
      },
    };
  }

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: "⚠️ Unknown modal submitted.",
      flags: 64,
    },
  };
}
