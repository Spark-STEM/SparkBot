import type { APIInteractionResponse } from "discord-api-types/v10";
import { getCallback } from "../builders/callbacks.ts";
import { getPersistentParams, getPersistentHandler, getPersistentModalHandler } from "../builders/callbacks.ts";
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

export async function runPersistentCallback(
  interaction: ComponentInteraction,
): Promise<APIInteractionResponse> {
  const resolved = await getPersistentParams(interaction.env, interaction.customId);
  if (!resolved) throw new Error(`No persistent component is stored for ${interaction.customId}.`);
  const callback = getPersistentHandler(resolved.handlerKey);
  if (!callback) throw new Error(`No persistent callback is registered for handler ${resolved.handlerKey}.`);
  await callback(interaction, resolved.params);
  if (!interaction.response) throw new Error("The persistent interaction callback did not send a response.");
  return interaction.response;
}

export async function runPersistentModalCallback(
  interaction: ModalInteraction,
): Promise<APIInteractionResponse> {
  const resolved = await getPersistentParams(interaction.env, interaction.customId);
  if (!resolved) throw new Error(`No persistent component is stored for ${interaction.customId}.`);
  const callback = getPersistentModalHandler(resolved.handlerKey);
  if (!callback) throw new Error(`No persistent modal callback is registered for handler ${resolved.handlerKey}.`);
  await callback(interaction, resolved.params);
  if (!interaction.response) throw new Error("The persistent modal callback did not send a response.");
  return interaction.response;
}
