import type { Builder } from "./core.ts";
type Json = Record<string, unknown>;

/** Builds an attachment descriptor for message payloads. */
export class AttachmentBuilder implements Builder {
  private readonly data: Json;
  constructor(url: string, name?: string) {
    if (!url.trim()) throw new Error("An attachment URL is required.");
    this.data = { url, ...(name ? { filename: name } : {}) };
  }
  setDescription(description: string) { this.data.description = description; return this; }
  setSpoiler(spoiler = true) { this.data.spoiler = spoiler; return this; }
  toJSON() { return this.data; }

}
