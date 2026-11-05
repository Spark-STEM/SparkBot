import { InteractionResponseType, type APIInteractionResponse, type APIMessageComponentInteraction } from "discord-api-types/v10";
import "../discordBS/builders/persistent-handlers.ts";
import { ComponentInteraction } from "../discordBS/interactions/component.ts";
import { getInteractionCallback, runCallback, runPersistentCallback } from "../discordBS/interactions/routing.ts";
import type { Env } from "../types.ts";

export async function handleComponent(interaction: APIMessageComponentInteraction, env: Env): Promise<APIInteractionResponse> {
  if (interaction.data.custom_id.startsWith("persistent:")) {
    return runPersistentCallback(new ComponentInteraction(interaction, env));
  }
  const callback = getInteractionCallback(interaction.data.custom_id);
  if (callback) return runCallback(callback, new ComponentInteraction(interaction, env));
  console.warn("Unhandled message component", interaction.data.custom_id);
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content: "This interaction is no longer available.", flags: 64 },
  };
}
