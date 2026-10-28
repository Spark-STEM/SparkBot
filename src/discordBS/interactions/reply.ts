import { InteractionResponseType, type APIInteractionResponse, type APIModalInteractionResponseCallbackData } from "discord-api-types/v10";
import type { Env } from "../../types.ts";
import { MessageFlags, type Builder } from "../builders/core.ts";
import type { Json } from "../types/common.ts";
import type { InteractionResponse, ReplyPayload } from "./core.ts";
import { InteractionContext } from "./core.ts";
import { DiscordMessage } from "../resources/message.ts";
import { DiscordRoutes } from "../rest/routes.ts";

export interface ReplyOptions extends ReplyPayload {}

function payload(options: ReplyOptions): Json {
  const components = options.components?.map((component) => component.toJSON());
  const usesComponentsV2 = components?.some((component) =>
    [9, 10, 12, 13, 14, 17].includes(Number(component.type)),
  );
  const { ephemeral, files: _files, ...message } = options;
  return {
    ...message,
    embeds: message.embeds?.map((embed) => embed.toJSON()),
    components,
    flags: usesComponentsV2
      ? Number(options.flags ?? 0) | MessageFlags.IsComponentsV2
      : ephemeral ? Number(options.flags ?? 0) | MessageFlags.Ephemeral : options.flags,
  };
}

export class InteractionReply extends InteractionContext {
  response?: InteractionResponse;
  readonly token: string;
  readonly tokenExpiresAt: Date;

  constructor(
    env: Env,
    readonly applicationId: string,
    token: string,
    guildId: string | null,
    userId: string | null,
    memberData?: Json,
  ) {
    super(env, guildId, userId, memberData);
    this.token = token;
    this.tokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  }
  get isAcknowledged(): boolean { return this.response !== undefined; }
  get isReplied(): boolean {
    return this.response?.type === InteractionResponseType.ChannelMessageWithSource ||
      this.response?.type === InteractionResponseType.UpdateMessage;
  }
  get isDeferred(): boolean {
    return this.response?.type === InteractionResponseType.DeferredChannelMessageWithSource;
  }
  get responseType(): InteractionResponseType | null { return this.response?.type ?? null; }
  get isTokenExpired(): boolean { return Date.now() >= this.tokenExpiresAt.getTime(); }
  async reply(options: ReplyOptions | string): Promise<this> {
    if (this.response) throw new Error("This interaction has already been acknowledged.");
    this.response = {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: typeof options === "string" ? { content: options } : payload(options),
    };
    return this;
  }

  async update(options: ReplyOptions): Promise<this> {
    if (this.response) throw new Error("This interaction has already been acknowledged.");
    this.response = { type: InteractionResponseType.UpdateMessage, data: payload(options) };
    return this;
  }

  async deferReply(ephemeral = false): Promise<this> {
    if (this.response) throw new Error("This interaction has already been acknowledged.");
    this.response = {
      type: InteractionResponseType.DeferredChannelMessageWithSource,
      data: ephemeral ? { flags: 64 } : undefined,
    };
    return this;
  }

  async showModal(modal: Builder): Promise<this> {
    if (this.response) throw new Error("This interaction has already been acknowledged.");
    this.response = {
      type: InteractionResponseType.Modal,
      data: modal.toJSON() as unknown as APIModalInteractionResponseCallbackData,
    };
    return this;
  }

  async followUp(options: ReplyOptions | string): Promise<DiscordMessage> {
    if (this.isTokenExpired) throw new Error("The interaction token has expired.");
    const body = typeof options === "string" ? { content: options } : options ? payload(options) : undefined;
    const files = typeof options === "string" ? [] : options.files ?? [];
    const message = files.length > 0
      ? await this.api.requestMultipart<Json>("POST",       `${DiscordRoutes.webhook(this.applicationId, this.token)}?wait=true`, body ?? {}, files)
      : await this.api.request<Json>("POST", `${DiscordRoutes.webhook(this.applicationId, this.token)}?wait=true`, body);
    const messageId = String(message.id ?? "");
    if (!messageId) throw new Error("Discord returned a follow-up without a message ID.");
    const route = DiscordRoutes.webhookMessage(this.applicationId, this.token, messageId);
    return new DiscordMessage(this.api, messageId, route, message);
  }
}
