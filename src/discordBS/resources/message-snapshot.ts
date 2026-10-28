import type { Json } from "../types/common.ts";

/** Immutable forwarded-message snapshot metadata. */
export class DiscordMessageSnapshot {
  readonly id: string;
  constructor(id: string, private readonly data: Json) { this.id = id; }
  get content(): string { return typeof this.data.content === "string" ? this.data.content : ""; }
  get authorId(): string | null {
    const author = this.data.author;
    return author && typeof author === "object" && typeof (author as Json).id === "string"
      ? (author as Json).id as string : null;
  }
  toJSON(): Json { return structuredClone(this.data); }
}
