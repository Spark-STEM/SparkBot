import { assertIntegerRange, assertRequiredText, type Builder } from './core.ts';

export interface CheckboxOption {
  label: string;
  value: string;
  description?: string;
  default?: boolean;
}

/** A standalone checkbox for a modal label. */
export class CheckboxBuilder implements Builder {
  private customId?: string;
  private checked = false;
  setCustomId(value: string) { assertRequiredText(value, 'Checkbox custom ID', 100); this.customId = value; return this; }
  setDefault(value = true) { this.checked = value; return this; }
  toJSON() {
    assertRequiredText(this.customId ?? '', 'Checkbox custom ID', 100);
    return { type: 23, custom_id: this.customId!, default: this.checked };
  }
}

/** A group of two to ten selectable checkbox options in a modal. */
export class CheckboxGroupBuilder implements Builder {
  private customId?: string;
  private options: CheckboxOption[] = [];
  private minValues = 1;
  private maxValues?: number;
  private required = true;
  setCustomId(value: string) { assertRequiredText(value, 'Checkbox group custom ID', 100); this.customId = value; return this; }
  setMinValues(value: number) { assertIntegerRange(value, 'Checkbox group minimum', 0, 10); this.minValues = value; return this; }
  setMaxValues(value: number) { assertIntegerRange(value, 'Checkbox group maximum', 1, 10); this.maxValues = value; return this; }
  setRequired(value = true) { this.required = value; return this; }
  addOptions(...options: CheckboxOption[]) {
    if (this.options.length + options.length > 10) throw new Error('Checkbox groups cannot contain more than 10 options.');
    for (const option of options) {
      assertRequiredText(option.label, 'Checkbox option label', 100);
      assertRequiredText(option.value, 'Checkbox option value', 100);
      if (option.description !== undefined) assertRequiredText(option.description, 'Checkbox option description', 100);
    }
    const combined = [...this.options, ...options];
    if (new Set(combined.map(option => option.value)).size !== combined.length) throw new Error('Checkbox option values must be unique.');
    this.options = structuredClone(combined);
    return this;
  }
  toJSON() {
    assertRequiredText(this.customId ?? '', 'Checkbox group custom ID', 100);
    assertIntegerRange(this.options.length, 'Checkbox group option count', 2, 10);
    const maximum = this.maxValues ?? this.options.length;
    if (this.minValues > maximum || maximum > this.options.length) throw new Error('Checkbox selection bounds must fit the available options.');
    return { type: 22, custom_id: this.customId!, min_values: this.minValues, max_values: maximum, required: this.required, options: structuredClone(this.options) };
  }
}
