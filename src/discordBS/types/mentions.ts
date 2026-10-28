import type { Json } from "./common.ts";

/** A mentioned role when a message does not provide enough context for a guild resource. */
export class DiscordMentionedRole {
  constructor(readonly id: string, private readonly data?: Json) {}
  get name(): string | null { return typeof this.data?.name === "string" ? this.data.name : null; }
  get color(): number | null { return typeof this.data?.color === "number" ? this.data.color : null; }
  get raw(): Json | undefined { return this.data; }
  toJSON(): { id: string; resource: string; data?: Json } {
    return { id: this.id, resource: "DiscordMentionedRole", ...(this.data ? { data: this.data } : {}) };
  }
}
