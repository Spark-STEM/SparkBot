import type { Json } from "../types/common.ts";

export interface EmbedAuthor { name: string; url?: string; iconUrl?: string; }
export interface EmbedFooter { text: string; iconUrl?: string; }
export interface EmbedMedia { url: string; proxyUrl?: string; width?: number; height?: number; }
export interface EmbedField { name: string; value: string; inline?: boolean; }

/** A typed, response-only Discord embed. */
export class DiscordEmbed {
  readonly id: string;
  private readonly payload: Json;
  constructor(id: string, data: Json = {}) {
    this.id = id;
    this.payload = structuredClone(data);
  }
  get title(): string | null { return typeof this.payload.title === "string" ? this.payload.title : null; }
  get description(): string | null { return typeof this.payload.description === "string" ? this.payload.description : null; }
  get url(): string | null { return typeof this.payload.url === "string" ? this.payload.url : null; }
  get color(): number | null { return typeof this.payload.color === "number" ? this.payload.color : null; }
  get timestamp(): Date | null { return typeof this.payload.timestamp === "string" ? new Date(this.payload.timestamp) : null; }
  get author(): EmbedAuthor | null {
    const author = this.payload.author;
    if (!author || typeof author !== "object" || typeof (author as Json).name !== "string") return null;
    const value = author as Json;
    return { name: value.name as string, ...(typeof value.url === "string" ? { url: value.url } : {}),
      ...(typeof value.icon_url === "string" ? { iconUrl: value.icon_url } : {}) };
  }
  get footer(): EmbedFooter | null {
    const footer = this.payload.footer;
    if (!footer || typeof footer !== "object" || typeof (footer as Json).text !== "string") return null;
    const value = footer as Json;
    return { text: value.text as string, ...(typeof value.icon_url === "string" ? { iconUrl: value.icon_url } : {}) };
  }
  get image(): EmbedMedia | null { return this.media("image"); }
  get thumbnail(): EmbedMedia | null { return this.media("thumbnail"); }
  get fields(): readonly EmbedField[] {
    return Array.isArray(this.payload.fields) ? this.payload.fields.filter((field): field is EmbedField =>
      Boolean(field && typeof field === "object" && typeof (field as Json).name === "string" &&
        typeof (field as Json).value === "string")) : [];
  }
  private media(key: "image" | "thumbnail"): EmbedMedia | null {
    const media = this.payload[key];
    if (!media || typeof media !== "object" || typeof (media as Json).url !== "string") return null;
    const value = media as Json;
    return { url: value.url as string, ...(typeof value.proxy_url === "string" ? { proxyUrl: value.proxy_url } : {}),
      ...(typeof value.width === "number" ? { width: value.width } : {}),
      ...(typeof value.height === "number" ? { height: value.height } : {}) };
  }
  toJSON(): Json { return structuredClone(this.payload); }
  clone(id = this.id): DiscordEmbed { return new DiscordEmbed(id, this.payload); }
}
