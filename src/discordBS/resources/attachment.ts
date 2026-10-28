import type { Json } from "../types/common.ts";

/** A file attached to a Discord message. */
export class DiscordAttachment {
  readonly id: string;
  get filename(): string { return typeof this.data?.filename === "string" ? this.data.filename : ""; }
  get url(): string { return typeof this.data?.url === "string" ? this.data.url : ""; }
  get proxyUrl(): string { return typeof this.data?.proxy_url === "string" ? this.data.proxy_url : this.url; }
  get size(): number { return typeof this.data?.size === "number" ? this.data.size : 0; }
  get width(): number | null { return typeof this.data?.width === "number" ? this.data.width : null; }
  get height(): number | null { return typeof this.data?.height === "number" ? this.data.height : null; }
  get contentType(): string | null { return typeof this.data?.content_type === "string" ? this.data.content_type : null; }
  get description(): string | null { return typeof this.data?.description === "string" ? this.data.description : null; }
  get ephemeral(): boolean { return this.data?.ephemeral === true; }
  get isImage(): boolean { return this.contentType?.startsWith("image/") === true; }
  get isVideo(): boolean { return this.contentType?.startsWith("video/") === true; }
  get isAudio(): boolean { return this.contentType?.startsWith("audio/") === true; }

  constructor(id: string, private readonly data?: Json) {
    this.id = id;
  }
}
