import type { APIInteractionResponse } from "discord-api-types/v10";
import { getCallback } from "../builders/callbacks.ts";
import type { ComponentInteraction } from "./component.ts";
import type { ModalInteraction } from "./modal.ts";

export async function runCallback(
  callback: ((interaction: ModalInteraction | ComponentInteraction) => Promise<unknown>) | undefined,
  interaction: ModalInteraction | ComponentInteraction,
): Promise<APIInteractionResponse> {
  if (!callback) throw new Error("No callback is registered for this interaction.");
  await callback(interaction);
  if (!interaction.response) throw new Error("The interaction callback did not send a response.");
  return interaction.response;
}

export function getInteractionCallback(customId: string) {
  return getCallback(customId) as
    ((interaction: ModalInteraction | ComponentInteraction) => Promise<unknown>) | undefined;
}
