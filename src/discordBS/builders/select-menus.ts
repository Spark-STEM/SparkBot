import { attachCallback } from "./callbacks.ts";
import { assertIntegerRange, assertLength, assertRequiredText, type Builder } from "./core.ts";
import type { ComponentInteraction } from "../interactions/component.ts";
type Json = Record<string, unknown>;
export interface SelectOption {
  label: string;
  value: string;
  description?: string;
  emoji?: Json;
  default?: boolean;
}
export class StringSelectMenuBuilder implements Builder {
  protected readonly data: Json = { type: 3, options: [] };
  setCustomId(id: string) { assertRequiredText(id, "Select menu custom ID", 100); this.data.custom_id = id; return this; }
  setPlaceholder(value: string) { assertLength(value, "Select menu placeholder", 150); this.data.placeholder = value; return this; }
  setMinValues(value: number) { assertIntegerRange(value, "Select menu minimum values", 0, 25); this.data.min_values = value; return this; }
  setMaxValues(value: number) { assertIntegerRange(value, "Select menu maximum values", 1, 25); this.data.max_values = value; return this; }
  addOptions(...options: SelectOption[]) {
    options.forEach((option) => {
      assertRequiredText(option.label, "Select option label", 100);
      assertRequiredText(option.value, "Select option value", 100);
      if (option.description !== undefined) assertLength(option.description, "Select option description", 100);
    });
    if ((this.data.options as Json[]).length + options.length > 25) {
      throw new Error("Select menus cannot contain more than 25 options.");
    }
    this.data.options = [...(this.data.options as Json[]), ...options];
    return this;
  }
  onSelect(callback: (interaction: ComponentInteraction) => Promise<unknown>) { return attachCallback(this, callback); }
  toJSON() {
    if (typeof this.data.custom_id !== "string") throw new Error("Select menus require a custom ID.");
    if (this.data.min_values !== undefined && this.data.max_values !== undefined &&
      (this.data.min_values as number) > (this.data.max_values as number)) {
      throw new Error("Select menu minimum values cannot exceed maximum values.");
    }
    const options = this.data.options as Json[];
    if (this.data.type === 3 && options.length === 0) throw new Error("String select menus require at least one option.");
    return this.data;
  }
}
export class EntitySelectMenuBuilder extends StringSelectMenuBuilder {
  setType(type: 5 | 6 | 7 | 8) { this.data.type = type; return this; }
}
