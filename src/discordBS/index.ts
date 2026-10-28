import type { Env } from "../types.ts";
import type { SlashCommand } from "../slashcommands/types.ts";
import { DiscordRestClient } from "./rest/client.ts";
import { DiscordGuild } from "./resources/guild.ts";
import { DiscordUser } from "./resources/user.ts";
import { DiscordMember } from "./resources/member.ts";
import { DiscordResource } from "./resources/base.ts";

export * from "./rest/client.ts";
export * from "./rest/routes.ts";
export * from "./resources/base.ts";
export * from "./resources/channel.ts";
export * from "./resources/dm-channel.ts";
export * from "./resources/channel-types.ts";
export * from "./resources/guild.ts";
export * from "./resources/member.ts";
export * from "./resources/message.ts";
export * from "./resources/reaction.ts";
export * from "./resources/webhook.ts";
export * from "./resources/invite.ts";
export * from "./resources/invite-details.ts";
export * from "./resources/role.ts";
export * from "./resources/permission-overwrite.ts";
export * from "./resources/emoji.ts";
export * from "./resources/sticker.ts";
export * from "./resources/attachment.ts";
export * from "./resources/poll.ts";
export * from "./resources/embed.ts";
export * from "./resources/audit-log.ts";
export * from "./resources/ban.ts";
export * from "./resources/message-snapshot.ts";
export * from "./resources/interaction-metadata.ts";
export * from "./resources/scheduled-event.ts";
export * from "./resources/auto-moderation.ts";
export * from "./resources/thread-member.ts";
export * from "./resources/managers.ts";
export * from "./resources/user.ts";
export * from "./types/common.ts";
export * from "./types/permissions.ts";
export * from "./types/collections.ts";
export * from "./types/message-components.ts";
export * from "./types/mentions.ts";
export * from "./types/validation.ts";
export * from "./types/pagination.ts";

/**
 * Discord.js-inspired facade for the Worker-safe Discord REST API.
 *
 * Resource getters only construct route-aware references; network requests are
 * made by `fetch`, `edit`, or an operation that needs current Discord data.
 */
export class DiscordClient extends DiscordRestClient {
  /** Gets a lazy guild reference by ID. */
  getGuild(id: string): DiscordGuild { return new DiscordGuild(this, id); }
  /** Gets a lazy user reference by ID. */
  getUser(id: string): DiscordUser { return new DiscordUser(this, id); }

}

export type { DiscordResource };
