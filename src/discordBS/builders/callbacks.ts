import type { Builder } from "./core.ts";
import type { ComponentInteraction } from "../interactions/component.ts";
import type { ModalInteraction } from "../interactions/modal.ts";
import type { Env } from "../../types.ts";

type InteractionCallback = (interaction: unknown) => Promise<unknown>;
const callbacks = new Map<string, InteractionCallback>();
const persistentCallbacks = new Map<string, (interaction: ComponentInteraction, params: Record<string, unknown>) => Promise<unknown>>();
const persistentModalCallbacks = new Map<string, (interaction: ModalInteraction, params: Record<string, unknown>) => Promise<unknown>>();
const persistentMetadata = new Map<string, PersistentMetadata>();
let persistentInitialization: Promise<void> | undefined;
let sequence = 0;
const persistentPrefix = "persistent:";

export type PersistentOptions = {
  persistent: true;
  ownerKey: string;
  persistentKey: string;
  params?: Record<string, unknown>;
};

export type PersistentMetadata = {
  customId: string;
  handlerKey: string;
  ownerKey: string;
  params: Record<string, unknown>;
};

export function registerPersistentHandler(
  handlerKey: string,
  callback: (interaction: ComponentInteraction, params: Record<string, unknown>) => Promise<unknown>,
): void {
  if (!handlerKey.trim() || typeof callback !== "function") {
    throw new Error("A persistent callback requires a handler key and callable handler.");
  }
  persistentCallbacks.set(handlerKey, callback);
}

export function registerPersistentModalHandler(
  handlerKey: string,
  callback: (interaction: ModalInteraction, params: Record<string, unknown>) => Promise<unknown>,
): void {
  if (!handlerKey.trim() || typeof callback !== "function") {
    throw new Error("A persistent modal callback requires a handler key and callable handler.");
  }
  persistentModalCallbacks.set(handlerKey, callback);
}

export function getPersistentModalHandler(handlerKey: string) {
  return persistentModalCallbacks.get(handlerKey);
}

export function getPersistentHandler(handlerKey: string) {
  return persistentCallbacks.get(handlerKey);
}

export function getPersistentMetadataByCustomId(customId: string): PersistentMetadata | undefined {
  return persistentMetadata.get(customId);
}

export function registerPersistentMetadata(metadata: PersistentMetadata): void {
  persistentMetadata.set(metadata.customId, metadata);
}

export async function initializePersistentComponents(env: Env): Promise<void> {
  if (!persistentInitialization) {
    persistentInitialization = env.database.select<{
      custom_id: string;
      owner_key: string;
      handler_key: string;
      params: string;
    }>("persistent_components").all()
      .then((rows) => {
        persistentMetadata.clear();
        for (const row of rows) {
          const params = JSON.parse(row.params);
          if (!params || typeof params !== "object" || Array.isArray(params)) {
            throw new Error(`Persistent params for ${row.custom_id} must be a JSON object.`);
          }
          persistentMetadata.set(row.custom_id, {
            customId: row.custom_id,
            ownerKey: row.owner_key,
            handlerKey: row.handler_key,
            params: params as Record<string, unknown>,
          });
        }
      })
      .catch((error) => {
        persistentInitialization = undefined;
        throw error;
      });
  }
  await persistentInitialization;
}

export function persistentCustomId(customId: string): string {
  return `${persistentPrefix}${customId}`;
}

export function createPersistentCustomId(
  handlerKey: string,
  ownerKey: string,
  persistentKey: string,
): string {
  const customId = persistentCustomId(`${handlerKey}:${ownerKey}:${persistentKey}`);
  if (customId.length > 100) {
    throw new Error("Persistent component IDs cannot exceed 100 characters.");
  }
  return customId;
}

export function isPersistentCustomId(customId: string): boolean {
  return customId.startsWith(persistentPrefix);
}

export function getPersistentHandlerKey(customId: string): string {
  return customId.slice(persistentPrefix.length);
}

export function getPersistentMetadata(builder: object): PersistentMetadata | undefined {
  return (builder as { persistentMetadata?: PersistentMetadata }).persistentMetadata;
}

export async function persistBuilder(
  env: Env,
  metadata: PersistentMetadata,
): Promise<void> {
  await env.database.upsert("persistent_components", {
    custom_id: metadata.customId,
    owner_key: metadata.ownerKey,
    handler_key: metadata.handlerKey,
    params: JSON.stringify(metadata.params),
  }, ["custom_id"]).run();
  registerPersistentMetadata(metadata);
}

export async function updatePersistentParams(
  env: Env,
  customId: string,
  params: Record<string, unknown>,
): Promise<void> {
  const metadata = persistentMetadata.get(customId);
  if (!metadata) throw new Error(`Persistent component ${customId} is not registered.`);
  await env.database.update("persistent_components", {
    params: JSON.stringify({ ...metadata.params, ...params }),
  }, { custom_id: customId }).run();
  metadata.params = { ...metadata.params, ...params };
}

export async function deletePersistentComponents(env: Env, ownerKey: string): Promise<void> {
  await env.database.delete("persistent_components", { owner_key: ownerKey }).run();
  for (const [customId, metadata] of persistentMetadata) {
    if (metadata.ownerKey === ownerKey) persistentMetadata.delete(customId);
  }
}

export async function persistPayloadComponents(env: Env, components: unknown): Promise<void> {
  if (!Array.isArray(components)) return;
  const metadataById = new Map<string, PersistentMetadata>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const builder = value as { getPersistentBuilders?: () => unknown[]; toJSON?: () => Record<string, unknown> };
    const metadata = (value as { getPersistentMetadata?: () => PersistentMetadata | undefined })
      .getPersistentMetadata?.();
    if (metadata) {
      metadataById.set(metadata.customId, metadata);
    }
    if (typeof builder.getPersistentBuilders === "function") {
      builder.getPersistentBuilders().forEach(visit);
    }
    const item = value as Record<string, unknown>;
    if (typeof item.custom_id === "string") {
      const metadata = getPersistentMetadataByCustomId(item.custom_id);
      if (metadata) metadataById.set(metadata.customId, metadata);
    }
    if (Array.isArray(item.components)) item.components.forEach(visit);
  };
  components.forEach(visit);
  await Promise.all([...metadataById.values()].map((metadata) => persistBuilder(env, metadata)));
}

export async function resolvePersistentCallback(
  env: Env,
  customId: string,
): Promise<((interaction: ComponentInteraction, params: Record<string, unknown>) => Promise<unknown>) | undefined> {
  const handlerKey = getPersistentHandlerKey(customId);
  const callback = getPersistentHandler(handlerKey);
  if (!callback) return undefined;
  return async (interaction, params) => callback(interaction, params);
}

export async function getPersistentParams(
  env: Env,
  customId: string,
): Promise<{ handlerKey: string; ownerKey: string; params: Record<string, unknown> } | undefined> {
  await initializePersistentComponents(env);
  let metadata = persistentMetadata.get(customId);
  if (!metadata) {
    const row = await env.database.query<{
      custom_id: string;
      owner_key: string;
      handler_key: string;
      params: string;
    }>(
      "SELECT custom_id, owner_key, handler_key, params FROM persistent_components WHERE custom_id = ? LIMIT 1",
      customId,
    ).first();
    if (row) {
      const params = JSON.parse(row.params);
      if (!params || typeof params !== "object" || Array.isArray(params)) {
        throw new Error(`Persistent params for ${customId} must be a JSON object.`);
      }
      metadata = {
        customId: row.custom_id,
        ownerKey: row.owner_key,
        handlerKey: row.handler_key,
        params: params as Record<string, unknown>,
      };
      persistentMetadata.set(customId, metadata);
    }
  }
  if (!metadata) return undefined;
  return {
    handlerKey: metadata.handlerKey,
    ownerKey: metadata.ownerKey,
    params: metadata.params,
  };
}

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
