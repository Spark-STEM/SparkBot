import { DiscordResource } from "./base.ts";
import type { DiscordRestClient } from "../rest/client.ts";
import type { Json } from "../types/common.ts";

/** A guild sticker resource. */
export class DiscordSticker extends DiscordResource<Json, DiscordSticker> {
  get name(): string | null { return typeof this.data?.name === "string" ? this.data.name : null; }
  get description(): string | null { return typeof this.data?.description === "string" ? this.data.description : null; }
  get tags(): string | null { return typeof this.data?.tags === "string" ? this.data.tags : null; }
  get formatType(): number | null { return typeof this.data?.format_type === "number" ? this.data.format_type : null; }
  get available(): boolean { return this.data?.available !== false; }
  get url(): string { return `https://cdn.discordapp.com/stickers/${this.id}.png`; }

  constructor(client: DiscordRestClient, private readonly guildId: string, id: string, data?: Json) {
    super(client, id, `/guilds/${guildId}/stickers/${id}`, data);
  }

  override fetch(): Promise<DiscordSticker> {
    return this.client.request<Json>("GET", this.route)
      .then((sticker) => new DiscordSticker(this.client, this.guildId, this.id, sticker));
  }

  override edit(payload: Json): Promise<DiscordSticker> {
    return this.client.request<Json>("PATCH", this.route, payload)
      .then((sticker) => new DiscordSticker(this.client, this.guildId, this.id, sticker));
  }
}
