import type { Json } from "../types/common.ts";

/** Typed metadata describing the interaction that produced a message. */
export class DiscordInteractionMetadata {
  constructor(private readonly data: Json) {}
  get id(): string | null { return typeof this.data.id === "string" ? this.data.id : null; }
  get type(): number | null { return typeof this.data.type === "number" ? this.data.type : null; }
  get userId(): string | null { return typeof this.data.user_id === "string" ? this.data.user_id : null; }
  toJSON(): Json { return structuredClone(this.data); }
}
