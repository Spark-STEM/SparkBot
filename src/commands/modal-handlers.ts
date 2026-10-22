import { requestConfirmation, finishRegistration, privateReply } from "./registration-confirmation.ts";
import {
  InteractionResponseType,
  type APIModalSubmitInteraction,
  type APIInteractionResponse,
} from "discord-api-types/v10";
import type { Env } from "../types.ts";
import { validateAndNormalizeName, registerMemberInDb, getChapters, findMemberCandidates } from "../services/member.ts";

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

    const submittedName = rawName.trim();
    if (Array.from(submittedName).length > 32) return privateReply("Name must be at most 32 characters.");
    const chapterId = chapterIdStr ? parseInt(chapterIdStr, 10) : 1;

    // Validate the selected chapter before writing.
    const chapters = await getChapters(env.SPARK_DB);
    const selectedChapter = chapters.find((c) => c.id === chapterId);

    const discordId = interaction.member?.user?.id || interaction.user?.id || null;

    if (!discordId) return privateReply("Registration requires a Discord account.");
    if (!selectedChapter) return privateReply("Please select a valid chapter.");
    const linked = await env.SPARK_DB.prepare("SELECT id FROM members WHERE discord_id = ?").bind(discordId).first();
    if (!linked) {
      const candidates = await findMemberCandidates(env.SPARK_DB, submittedName, chapterId);
      if (candidates.length) return requestConfirmation(env, { discordId, guildId: interaction.guild_id, name: submittedName, chapterId }, candidates);
    }

    // 1. Save to D1 database
    const dbResult = await registerMemberInDb(env.SPARK_DB, {
      name: submittedName,
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

    return finishRegistration(env, discordId, interaction.guild_id, submittedName);
  }

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: "⚠️ Unknown modal submitted.",
      flags: 64,
    },
  };
}
