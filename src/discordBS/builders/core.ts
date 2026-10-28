type Json = Record<string, unknown>;

/** Anything that can be serialized into a Discord API payload. */
export interface Builder {
  /** Returns the Discord API representation of this builder. */
  toJSON(): Json;
}

export function assertRequiredText(value: string, label: string, maxLength?: number): void {
  if (!value.trim()) throw new Error(`${label} is required.`);
  if (maxLength !== undefined && value.length > maxLength) {
    throw new Error(`${label} cannot exceed ${maxLength} characters.`);
  }
}

export function assertLength(value: string, label: string, maxLength: number): void {
  if (value.length > maxLength) throw new Error(`${label} cannot exceed ${maxLength} characters.`);
}

export function assertIntegerRange(value: number, label: string, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  }
}

/** Flags used by Discord interaction message responses. */
export const MessageFlags = {
  IsComponentsV2: 1 << 15,
  Ephemeral: 1 << 6,
} as const;
