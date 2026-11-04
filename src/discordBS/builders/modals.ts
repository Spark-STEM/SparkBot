import { attachCallback } from "./callbacks.ts";
import type { ModalInteraction } from "../interactions/modal.ts";
import { assertLength, assertRequiredText, type Builder } from "./core.ts";
type Json = Record<string, unknown>;
type ModalComponentCount = [] | [unknown] | [unknown, unknown] | [unknown, unknown, unknown] |
  [unknown, unknown, unknown, unknown] | [unknown, unknown, unknown, unknown, unknown];
type WithinModalLimit<Existing extends unknown[], Added extends unknown[]> =
  number extends Added["length"]
    ? Added
    : [...Existing, ...Added] extends ModalComponentCount ? Added : never;
export const TextInputStyle = { Short: 1, Paragraph: 2 } as const;
export class TextDisplayBuilder implements Builder {
  private readonly data: Json = { type: 10 };
  setContent(value: string) {
    assertRequiredText(value, "Text display content", 4000);
    this.data.content = value;
    return this;
  }
  toJSON() {
    if (typeof this.data.content !== "string") throw new Error("Text display content is required.");
    return this.data;
  }
}
export class ModalBuilder<
  HasCustomId extends boolean = false,
  Components extends unknown[] = [],
> implements Builder {
  private readonly data: Json = { components: [] };
  setTitle(title: string) {
    if (!title.trim()) throw new Error("Modal title cannot be empty.");
    if (title.length > 45) throw new Error("Modal title cannot exceed 45 characters.");
    this.data.title = title;
    return this;
  }
  setCustomId(id: string): this & ModalBuilder<true, Components> {
    if (!id.trim()) throw new Error("Modal custom ID cannot be empty.");
    if (id.length > 100) throw new Error("Modal custom ID cannot exceed 100 characters.");
    this.data.custom_id = id;
    return this;
  }
  addComponents<Added extends Builder[]>(
    ...components: Added & WithinModalLimit<Components, Added>
  ): ModalBuilder<HasCustomId, [...Components, ...Added]> {
    const serialized = components.map((component) => component.toJSON());
    (this.data.components as Json[]).push(...serialized.map((component) =>
      component.type === 1 || component.type === 10 || component.type === 18
        ? component
        : { type: 1, components: [component] },
    ));
    return this as unknown as ModalBuilder<HasCustomId, [...Components, ...Added]>;
  }
  addLabelComponents<Added extends Builder[]>(
    ...components: Added & WithinModalLimit<Components, Added>
  ) {
    return (this as ModalBuilder<HasCustomId, Components>).addComponents(...components as Builder[]);
  }
  onSubmit(callback: (interaction: ModalInteraction) => Promise<unknown>) { return attachCallback(this, callback); }
  toJSON(this: ModalBuilder<true, Components>) {
    if (typeof this.data.title !== "string") throw new Error("Modal title is required.");
    if (typeof this.data.custom_id !== "string") throw new Error("Modal custom ID is required.");
    const components = this.data.components as Json[];
    if (!components.length) throw new Error("Modal must contain at least one component.");
    if (components.length > 5) throw new Error("Modals cannot contain more than 5 components.");
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
  setDescription(description: string) {
    if (description.length > 100) throw new Error("Text input description cannot exceed 100 characters.");
    this.data.description = description;
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
    if (this.data.description !== undefined && typeof this.data.description !== "string") {
      throw new Error("Text input description must be text.");
    }
    if (this.data.min_length !== undefined && this.data.max_length !== undefined &&
      (this.data.min_length as number) > (this.data.max_length as number)) {
      throw new Error("Text input minimum length cannot exceed maximum length.");
    }
    if (typeof this.data.description === "string") {
      const { description, label, ...component } = this.data;
      return {
        type: 18,
        label,
        description,
        component,
      };
    }
    return this.data;
  }
}
export class LabelBuilder implements Builder {
  private readonly data: Json = { type: 18 };
  setLabel(value: string) { this.data.label = value; return this; }
  setDescription(value: string) {
    if (value.length > 100) throw new Error("Label description cannot exceed 100 characters.");
    this.data.description = value;
    return this;
  }
  setTextInputComponent(component: Builder) { this.data.component = component.toJSON(); return this; }
  toJSON() {
    if (typeof this.data.label !== "string") throw new Error("Label text is required.");
    assertLength(this.data.label, "Label text", 45);
    if (this.data.description !== undefined && typeof this.data.description !== "string") {
      throw new Error("Label description must be text.");
    }
    if (!this.data.component) throw new Error("Labels require a text input component.");
    return this.data;
  }
}
