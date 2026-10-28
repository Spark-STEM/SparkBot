import type { Json } from "../types/common.ts";
import type { APIInteractionResponse, InteractionResponseType } from "discord-api-types/v10";
import type { Env } from "../../types.ts";
import { DiscordClient } from "../index.ts";
import type { DiscordGuild } from "../resources/guild.ts";
import type { DiscordMember } from "../resources/member.ts";
import { DiscordMember as DiscordMemberResource } from "../resources/member.ts";

export type ReplyPayload = Json & {
  embeds?: Array<{ toJSON(): Json }>;
  components?: Array<{ toJSON(): Json }>;
  ephemeral?: boolean;
  files?: Array<{ name: string; data: Blob | ArrayBuffer | string; description?: string; spoiler?: boolean }>;
};

export type InteractionCallback<T> = (interaction: T) => Promise<unknown>;
export type InteractionResponse = APIInteractionResponse;
export type ChannelMessageResponse = Extract<InteractionResponse, { type: InteractionResponseType.ChannelMessageWithSource }>;
export type DeferredInteractionResponse = Extract<InteractionResponse, {
  type: InteractionResponseType.DeferredChannelMessageWithSource;
}>;
export type ComponentUpdateResponse = Extract<InteractionResponse, { type: InteractionResponseType.UpdateMessage }>;
export type ModalResponse = Extract<InteractionResponse, { type: InteractionResponseType.Modal }>;

export class InteractionContext {
  protected readonly api: DiscordClient;
  readonly user: DiscordMember | null;
  readonly guild: DiscordGuild | null;

  constructor(
    env: Env,
    guildId: string | null,
    userId: string | null,
    memberData?: Json,
  ) {
    this.api = new DiscordClient(env, []);
    this.user = guildId && userId
      ? new DiscordMemberResource(this.api, guildId, userId, memberData)
      : null;
    this.guild = guildId ? this.api.getGuild(guildId) : null;
  }
}
