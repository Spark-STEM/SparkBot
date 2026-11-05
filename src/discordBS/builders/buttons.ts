import type { ComponentInteraction } from "../interactions/component.ts";
import { attachCallback, createPersistentCustomId, registerPersistentMetadata, type PersistentMetadata, type PersistentOptions } from "./callbacks.ts";
import { assertRequiredText, type Builder } from "./core.ts";
type Json = Record<string, unknown>;
type ActionRowComponentCount = [] | [unknown] | [unknown, unknown] | [unknown, unknown, unknown] |
  [unknown, unknown, unknown, unknown] | [unknown, unknown, unknown, unknown, unknown];
type WithinActionRowLimit<Existing extends unknown[], Added extends unknown[]> =
  number extends Added["length"]
    ? Added
    : [...Existing, ...Added] extends ActionRowComponentCount ? Added : never;
export const ButtonStyle = { Primary: 1, Secondary: 2, Success: 3, Danger: 4, Link: 5 } as const;
type Added = Builder[];
export class ButtonBuilder implements Builder {
  private readonly data: Json = { type: 2 };
  private persistentMetadata?: PersistentMetadata;
  setCustomId(id: string) { assertRequiredText(id, "Button custom ID", 100); this.data.custom_id = id; return this; }
  setLabel(label: string) { assertRequiredText(label, "Button label", 80); this.data.label = label; return this; }
  setStyle(style: number) {
    if (!Object.values(ButtonStyle).includes(style as typeof ButtonStyle[keyof typeof ButtonStyle])) {
      throw new Error("Button style is invalid.");
    }
    this.data.style = style;
    return this;
  }
  setURL(url: string) { assertRequiredText(url, "Button URL"); this.data.url = url; return this; }
  setEmoji(emoji: Json) { this.data.emoji = emoji; return this; }
  setDisabled(disabled = true) { this.data.disabled = disabled; return this; }
  onClick(callback: ((interaction: ComponentInteraction) => Promise<unknown>) | string, options?: PersistentOptions) {
    if (typeof callback === "function") return attachCallback(this, callback);
    if (!options) throw new Error("Persistent button options are required.");
    return this.onPersistentClick(callback, options);
  }
  private onPersistentClick(handlerKey: string, options: PersistentOptions) {
    if (!handlerKey.trim() || !options.ownerKey.trim()) throw new Error("Persistent buttons require a handler and owner key.");
    const customId = createPersistentCustomId(handlerKey, options.ownerKey, options.persistentKey);
    this.persistentMetadata = {
      customId,
      handlerKey,
      ownerKey: options.ownerKey,
      params: options.params ?? {},
    };
    registerPersistentMetadata(this.persistentMetadata);
    return this.setCustomId(customId);
  }
  get persistent() {
    return {
      updateParam: (params: Record<string, unknown>) => {
        if (!this.persistentMetadata) throw new Error("This button is not persistent.");
        this.persistentMetadata.params = { ...this.persistentMetadata.params, ...params };
        return this;
      },
    };
  }
  getPersistentMetadata() { return this.persistentMetadata; }
  toJSON() {
    if (typeof this.data.style !== "number") throw new Error("Button style is required.");
    const isLink = this.data.style === ButtonStyle.Link;
    if (isLink && typeof this.data.url !== "string") throw new Error("Link buttons require a URL.");
    if (!isLink && typeof this.data.custom_id !== "string") throw new Error("Non-link buttons require a custom ID.");
    return this.data;
  }
}
export class ActionRowBuilder<Components extends unknown[] = []> implements Builder {
  private readonly data: Json = { type: 1, components: [] };
  private readonly componentBuilders: Builder[] = [];
  addComponents(...components: Builder[]) {
    this.componentBuilders.push(...components);
    (this.data.components as Json[]).push(...components.map((component) => component.toJSON()));
    return this as unknown as ActionRowBuilder<[...Components, ...Added]>;
  }
  getPersistentBuilders(): Builder[] { return this.componentBuilders; }
  toJSON() {
    const components = this.data.components as Json[];
    if (components.length === 0) throw new Error("Action rows require at least one component.");
    if (components.length > 5) throw new Error("Action rows cannot contain more than 5 components.");
    return this.data;
  }
}
