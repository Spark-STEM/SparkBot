import type { Json } from "./common.ts";

/** A typed component found in a message payload. */
export interface DiscordMessageComponent {
  readonly id: string;
  readonly type: number;
  readonly customId: string | null;
  readonly raw: Json;
}

export interface DiscordButtonComponent extends DiscordMessageComponent {
  readonly style: number | null;
  readonly label: string | null;
  readonly url: string | null;
  readonly disabled: boolean;
}

export interface DiscordSelectMenuComponent extends DiscordMessageComponent {
  readonly placeholder: string | null;
  readonly minValues: number | null;
  readonly maxValues: number | null;
  readonly disabled: boolean;
}

/** Converts Discord component JSON into a stable typed view. */
export function messageComponent(data: Json, index: number): DiscordMessageComponent | DiscordButtonComponent | DiscordSelectMenuComponent {
  const base = {
    id: String(data.custom_id ?? data.id ?? `component-${index}`),
    type: typeof data.type === "number" ? data.type : 0,
    customId: typeof data.custom_id === "string" ? data.custom_id : null,
    raw: data,
  };
  if (base.type === 2) {
    return {
      ...base,
      style: typeof data.style === "number" ? data.style : null,
      label: typeof data.label === "string" ? data.label : null,
      url: typeof data.url === "string" ? data.url : null,
      disabled: data.disabled === true,
    } satisfies DiscordButtonComponent;
  }
  if ([3, 5, 6, 7, 8].includes(base.type)) {
    return {
      ...base,
      placeholder: typeof data.placeholder === "string" ? data.placeholder : null,
      minValues: typeof data.min_values === "number" ? data.min_values : null,
      maxValues: typeof data.max_values === "number" ? data.max_values : null,
      disabled: data.disabled === true,
    } satisfies DiscordSelectMenuComponent;
  }
  return base;
}
