import { InteractionResponseType, type APIModalSubmitInteraction, type APIInteractionResponse } from "discord-api-types/v10";
import type { Env } from "../types.ts";
import { ModalInteraction } from "../discordBS/interactions/modal.ts";
import { getInteractionCallback, runCallback } from "../discordBS/interactions/routing.ts";

export async function handleModal(interaction: APIModalSubmitInteraction, env: Env): Promise<APIInteractionResponse> {
  const callback = getInteractionCallback(interaction.data.custom_id);
  if (callback) return runCallback(callback, new ModalInteraction(interaction, env));
  console.warn("Unhandled modal submission", interaction.data.custom_id);
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content: "This form is no longer available.", flags: 64 },
  };
}
