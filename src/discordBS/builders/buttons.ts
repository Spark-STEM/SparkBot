import { attachCallback } from "./callbacks.ts";
import type { ComponentInteraction } from "../interactions/component.ts";
import { assertLength, assertRequiredText, type Builder } from "./core.ts";
type Json = Record<string, unknown>;
export const ButtonStyle = { Primary: 1, Secondary: 2, Success: 3, Danger: 4, Link: 5 } as const;
export class ButtonBuilder implements Builder {
  private readonly data: Json = { type: 2 };
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
  onClick(callback: (interaction: ComponentInteraction) => Promise<unknown>) { return attachCallback(this, callback); }
  toJSON() {
    if (typeof this.data.style !== "number") throw new Error("Button style is required.");
    const isLink = this.data.style === ButtonStyle.Link;
    if (isLink && typeof this.data.url !== "string") throw new Error("Link buttons require a URL.");
    if (!isLink && typeof this.data.custom_id !== "string") throw new Error("Non-link buttons require a custom ID.");
    return this.data;
  }
}
export class ActionRowBuilder implements Builder {
  private readonly data: Json = { type: 1, components: [] };
  addComponents(...components: Builder[]) {
    (this.data.components as Json[]).push(...components.map((component) => component.toJSON()));
    return this;
  }
  toJSON() {
    const components = this.data.components as Json[];
    if (components.length === 0) throw new Error("Action rows require at least one component.");
    if (components.length > 5) throw new Error("Action rows cannot contain more than 5 components.");
    return this.data;
  }
}
