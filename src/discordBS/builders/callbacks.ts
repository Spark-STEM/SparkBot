import type { Builder } from "./core.ts";
import type { ComponentInteraction } from "../interactions/component.ts";
import type { ModalInteraction } from "../interactions/modal.ts";

type InteractionCallback = (interaction: unknown) => Promise<unknown>;
const callbacks = new Map<string, InteractionCallback>();
let sequence = 0;

/** Registers a callback and assigns a unique custom ID to an interactive builder. */
export function attachCallback<T extends { setCustomId(customId: string): T }, I>(
  builder: T,
  callback: (interaction: I) => Promise<unknown>,
): T {
  if (typeof callback !== "function") throw new Error("A callable interaction callback is required.");
  const customId = `spark:action:${Date.now().toString(36)}:${(sequence++).toString(36)}`;
  callbacks.set(customId, (interaction) => callback(interaction as I));
  return builder.setCustomId(customId);
}

export function registerComponent(
  customId: string,
  callback: (interaction: ComponentInteraction) => Promise<unknown>,
): void {
  if (!customId || typeof callback !== "function") throw new Error("A component callback requires an ID and callable handler.");
  callbacks.set(customId, (interaction) => callback(interaction as ComponentInteraction));
}

export function registerModal(
  customId: string,
  callback: (interaction: ModalInteraction) => Promise<unknown>,
): void {
  if (!customId || typeof callback !== "function") throw new Error("A modal callback requires an ID and callable handler.");
  callbacks.set(customId, (interaction) => callback(interaction as ModalInteraction));
}

/** Resolves a registered callback by custom ID. */
export function getCallback(customId: string): InteractionCallback | undefined {
  return callbacks.get(customId);
}

export type { Builder };
