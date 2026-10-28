import { attachCallback } from "./callbacks.ts";
import type { ModalInteraction } from "../interactions/modal.ts";
import { assertLength, type Builder } from "./core.ts";
type Json = Record<string, unknown>;
export const TextInputStyle = { Short: 1, Paragraph: 2 } as const;
export class ModalBuilder implements Builder {
  private readonly data: Json = { type: 9, components: [] };
  setTitle(title: string) {
    if (!title.trim()) throw new Error("Modal title cannot be empty.");
    if (title.length > 45) throw new Error("Modal title cannot exceed 45 characters.");
    this.data.title = title;
    return this;
  }
  setCustomId(id: string) {
    if (!id.trim()) throw new Error("Modal custom ID cannot be empty.");
    if (id.length > 100) throw new Error("Modal custom ID cannot exceed 100 characters.");
    this.data.custom_id = id;
    return this;
  }
  addComponents(...components: Builder[]) {
    (this.data.components as Json[]).push(...components.map((component) => component.toJSON())); return this;
  }
  addLabelComponents(...components: Builder[]) { return this.addComponents(...components); }
  onSubmit(callback: (interaction: ModalInteraction) => Promise<unknown>) { return attachCallback(this, callback); }
  toJSON() {
    if (typeof this.data.title !== "string") throw new Error("Modal title is required.");
    if (typeof this.data.custom_id !== "string") throw new Error("Modal custom ID is required.");
    if (!(this.data.components as Json[]).length) throw new Error("Modal must contain at least one component.");
    return this.data;
  }
}
export class TextInputBuilder implements Builder {
  private readonly data: Json = { type: 4 };
  setCustomId(id: string) {
    if (!id.trim()) throw new Error("Text input custom ID cannot be empty.");
    if (id.length > 100) throw new Error("Text input custom ID cannot exceed 100 characters.");
    this.data.custom_id = id;
    return this;
  }
  setStyle(style: number) {
    if (style !== TextInputStyle.Short && style !== TextInputStyle.Paragraph) {
      throw new Error("Text input style must be Short or Paragraph.");
    }
    this.data.style = style;
    return this;
  }
  setLabel(label: string) {
    if (!label.trim()) throw new Error("Text input label cannot be empty.");
    if (label.length > 45) throw new Error("Text input label cannot exceed 45 characters.");
    this.data.label = label;
    return this;
  }
  setPlaceholder(value: string) {
    if (value.length > 100) throw new Error("Text input placeholder cannot exceed 100 characters.");
    this.data.placeholder = value;
    return this;
  }
  setValue(value: string) {
    if (value.length > 4000) throw new Error("Text input value cannot exceed 4000 characters.");
    this.data.value = value;
    return this;
  }
  setMinLength(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 4000) {
      throw new Error("Text input minimum length must be an integer from 0 to 4000.");
    }
    this.data.min_length = value;
    return this;
  }
  setMaxLength(value: number) {
    if (!Number.isInteger(value) || value < 1 || value > 4000) {
      throw new Error("Text input maximum length must be an integer from 1 to 4000.");
    }
    this.data.max_length = value;
    return this;
  }
  setRequired(value = true) { this.data.required = value; return this; }
  toJSON() {
    if (typeof this.data.custom_id !== "string") throw new Error("Text input custom ID is required.");
    if (typeof this.data.style !== "number") throw new Error("Text input style is required.");
    if (typeof this.data.label !== "string") throw new Error("Text input label is required.");
    if (this.data.min_length !== undefined && this.data.max_length !== undefined &&
      (this.data.min_length as number) > (this.data.max_length as number)) {
      throw new Error("Text input minimum length cannot exceed maximum length.");
    }
    return this.data;
  }
}
export class LabelBuilder implements Builder {
  private readonly data: Json = { type: 18 };
  setLabel(value: string) { this.data.label = value; return this; }
  setDescription(value: string) { this.data.description = value; return this; }
  setTextInputComponent(component: Builder) { this.data.component = component.toJSON(); return this; }
  toJSON() {
    if (typeof this.data.label !== "string") throw new Error("Label text is required.");
    assertLength(this.data.label, "Label text", 45);
    if (!this.data.component) throw new Error("Labels require a text input component.");
    return this.data;
  }
}
