import { DiscordResource } from "./base.ts";
import type { DiscordRestClient } from "../rest/client.ts";
import type { Json } from "../types/common.ts";

/** A custom guild emoji resource. */
export class DiscordEmoji extends DiscordResource<Json, DiscordEmoji> {
  get name(): string | null { return typeof this.data?.name === "string" ? this.data.name : null; }
  get animated(): boolean { return this.data?.animated === true; }
  get available(): boolean { return this.data?.available !== false; }
  get managed(): boolean { return this.data?.managed === true; }
  get url(): string { return `https://cdn.discordapp.com/emojis/${this.id}.${this.animated ? "gif" : "png"}`; }

  constructor(client: DiscordRestClient, private readonly guildId: string, id: string, data?: Json) {
    super(client, id, `/guilds/${guildId}/emojis/${id}`, data);
  }

  override fetch(): Promise<DiscordEmoji> {
    return this.client.request<Json>("GET", this.route)
      .then((emoji) => new DiscordEmoji(this.client, this.guildId, this.id, emoji));
  }

  override edit(payload: Json): Promise<DiscordEmoji> {
    return this.client.request<Json>("PATCH", this.route, payload)
      .then((emoji) => new DiscordEmoji(this.client, this.guildId, this.id, emoji));
  }
}
