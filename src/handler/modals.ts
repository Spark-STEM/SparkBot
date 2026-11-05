import { databaseInteraction } from "../slashcommands/database.ts";
import { InteractionResponseType, type APIModalSubmitInteraction, type APIInteractionResponse } from "discord-api-types/v10";
import type { Env } from "../types.ts";
import { ModalInteraction } from "../discordBS/interactions/modal.ts";
import { getInteractionCallback, runCallback, runPersistentModalCallback } from "../discordBS/interactions/routing.ts";
import "../discordBS/builders/persistent-handlers.ts";

export async function handleModal(interaction: APIModalSubmitInteraction, env: Env): Promise<APIInteractionResponse> {
  if (interaction.data.custom_id.startsWith("db:")) {
    const wrapped = new ModalInteraction(interaction, env);
    await databaseInteraction(wrapped, env);
    if (!wrapped.response) throw new Error("Database interaction did not send a response.");
    return wrapped.response;
  }
  if (interaction.data.custom_id.startsWith("persistent:")) {
    return runPersistentModalCallback(new ModalInteraction(interaction, env));
  }
  const callback = getInteractionCallback(interaction.data.custom_id);
  if (callback) return runCallback(callback, new ModalInteraction(interaction, env));
  console.warn("Unhandled modal submission", interaction.data.custom_id);
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content: "This form is no longer available.", flags: 64 },
  };
}
