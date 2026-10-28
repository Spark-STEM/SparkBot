import { DiscordChannel } from "./channel.ts";
import type { DiscordRestClient } from "../rest/client.ts";
import type { Json, MessagePayload } from "../types/common.ts";
import { DiscordRoutes } from "../rest/routes.ts";
import { DiscordCollection } from "../types/collections.ts";
import { DiscordMessage } from "./message.ts";

/** A direct-message channel associated with one global Discord user. */
export class DiscordDMChannel extends DiscordChannel {
  constructor(
    client: DiscordRestClient,
    readonly userId: string,
    data?: Json,
  ) {
    super(client, String(data?.id ?? `dm:${userId}`), data);
  }

  /** Resolves this DM channel, creating it only when a message is sent. */
  private async resolve(create: boolean): Promise<DiscordChannel> {
    if (this.raw?.id && typeof this.raw.id === "string") {
      return new DiscordChannel(this.client, this.raw.id, this.raw);
    }

    const channels = await this.client.request<Json[]>("GET", DiscordRoutes.userDM());
    const existing = channels.find((channel) => {
      const recipients = Array.isArray(channel.recipients) ? channel.recipients : [];
      return recipients.some((recipient) =>
        recipient && typeof recipient === "object" && String((recipient as Json).id ?? "") === this.userId);
    });
    if (existing && typeof existing.id === "string") {
      return new DiscordChannel(this.client, existing.id, existing);
    }
    if (!create) {
      throw new Error(`No existing direct-message channel was found for user ${this.userId}.`);
    }
    return this.client.request<Json>("POST", DiscordRoutes.userDM(), { recipient_id: this.userId })
      .then((channel) => new DiscordChannel(this.client, String(channel.id), channel));
  }

  override fetch(): Promise<DiscordDMChannel> {
    return this.resolve(false).then((channel) =>
      new DiscordDMChannel(this.client, this.userId, channel.raw));
  }

  send(payload: MessagePayload): Promise<DiscordMessage> {
    return this.resolve(true).then((channel) => channel.sendMessage(payload));
  }

  override fetchMessage(messageId: string): Promise<DiscordMessage> {
    return this.resolve(false).then((channel) => channel.fetchMessage(messageId));
  }

  override fetchMessages(options: {
    around?: string;
    before?: string;
    after?: string;
    limit?: number;
  } = {}): Promise<DiscordCollection<DiscordMessage>> {
    return this.resolve(false).then((channel) => channel.fetchMessages(options));
  }

  override fetchPins(): Promise<DiscordCollection<DiscordMessage>> {
    return this.resolve(false).then((channel) => channel.fetchPins());
  }

  override async *messages(options: {
    limit?: number;
    before?: string;
    after?: string;
  } = {}): AsyncGenerator<DiscordMessage> {
    const channel = await this.resolve(false);
    for await (const message of channel.messages(options)) yield message;
  }
}
