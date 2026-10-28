import type { DiscordRestClient } from "../rest/client.ts";
import { DiscordCollection } from "../types/collections.ts";
import { DiscordChannel } from "./channel.ts";
import {
  DiscordCategoryChannel,
  DiscordForumChannel,
  DiscordStageChannel,
  DiscordTextChannel,
  DiscordThreadChannel,
  DiscordVoiceChannel,
} from "./channel-types.ts";
import { DiscordMember } from "./member.ts";
import { DiscordRole } from "./role.ts";

export class GuildChannelManager {
  constructor(private readonly client: DiscordRestClient, private readonly guildId: string) {}
  fetch(id: string): Promise<DiscordChannel> {
    return this.client.request<Record<string, unknown>>("GET", `/channels/${id}`)
      .then((item) => new DiscordChannel(this.client, id, item));
  }
  fetchAll(): Promise<DiscordCollection<DiscordChannel>> {
    return this.client.request<Record<string, unknown>[]>("GET", `/guilds/${this.guildId}/channels`)
      .then((items) => new DiscordCollection(...items.map((item) => channelResource(this.client, item))));
  }
}

function channelResource(client: DiscordRestClient, item: Record<string, unknown>): DiscordChannel {
  const id = String(item.id);
  const type = item.type;
  if (type === 0 || type === 5) return new DiscordTextChannel(client, id, item);
  if (type === 2) return new DiscordVoiceChannel(client, id, item);
  if (type === 4) return new DiscordCategoryChannel(client, id, item);
  if (type === 13) return new DiscordStageChannel(client, id, item);
  if (type === 15) return new DiscordForumChannel(client, id, item);
  if (type === 10 || type === 11 || type === 12) return new DiscordThreadChannel(client, id, item);
  return new DiscordChannel(client, id, item);
}

export class GuildRoleManager {
  constructor(private readonly client: DiscordRestClient, private readonly guildId: string) {}
  fetch(id: string): Promise<DiscordRole> {
    return new DiscordRole(this.client, this.guildId, id).fetch();
  }
  fetchAll(): Promise<DiscordCollection<DiscordRole>> {
    return this.client.request<Record<string, unknown>[]>("GET", `/guilds/${this.guildId}/roles`)
      .then((items) => new DiscordCollection(...items.map((item) =>
        new DiscordRole(this.client, this.guildId, String(item.id), item))));
  }
}

export class GuildMemberManager {
  constructor(private readonly client: DiscordRestClient, private readonly guildId: string) {}
  fetch(id: string): Promise<DiscordMember> {
    return new DiscordMember(this.client, this.guildId, id).fetch();
  }
  fetchAll(options: { limit?: number; after?: string } = {}): Promise<DiscordCollection<DiscordMember>> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set("limit", String(options.limit));
    if (options.after) params.set("after", options.after);
    const suffix = params.size ? `?${params}` : "";
    return this.client.request<Record<string, unknown>[]>("GET", `/guilds/${this.guildId}/members${suffix}`)
      .then((items) => new DiscordCollection(...items.map((item) => {
        const user = item.user && typeof item.user === "object" ? item.user as Record<string, unknown> : {};
        return new DiscordMember(this.client, this.guildId, String(user.id ?? item.id), item);
      })));
  }
}
