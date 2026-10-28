import { DiscordResource } from "./base.ts";
import type { DiscordRestClient } from "../rest/client.ts";
import type { Json, MessagePayload } from "../types/common.ts";
import { DiscordMessageReaction } from "./reaction.ts";
import type { DiscordChannel } from "./channel.ts";
import { DiscordCollection } from "../types/collections.ts";
import { DiscordAttachment } from "./attachment.ts";
import { DiscordPoll } from "./poll.ts";
import { DiscordUser } from "./user.ts";
import { DiscordMentionedRole } from "../types/mentions.ts";
import { messageComponent, type DiscordMessageComponent } from "../types/message-components.ts";
import { DiscordEmbed } from "./embed.ts";
import { assertSnowflake } from "../types/validation.ts";
import { DiscordMessageSnapshot } from "./message-snapshot.ts";
import { DiscordInteractionMetadata } from "./interaction-metadata.ts";

export interface ForwardMessageOptions {
  /** Whether Discord should reject forwarding if the source is unavailable. */
  failIfNotExists?: boolean;
}

export interface MessageReplyOptions extends Json {
  /** Whether Discord should fail if the referenced message is unavailable. */
  failIfNotExists?: boolean;
  /** Prevents Discord from rendering embeds in the reply. */
  suppressEmbeds?: boolean;
  files?: MessagePayload["files"];
}

/** A channel message that can be fetched, edited, or deleted. */
export class DiscordMessage extends DiscordResource<Json, DiscordMessage> {
  get channelId(): string { return this.messageRoute.split("/")[2] ?? ""; }
  get content(): string { return typeof this.data?.content === "string" ? this.data.content : ""; }
  get author(): DiscordUser | null {
    return this.data?.author && typeof this.data.author === "object"
      ? new DiscordUser(this.client, String((this.data.author as Json).id ?? ""), this.data.author as Json)
      : null;
  }
  get timestamp(): Date | null {
    return typeof this.data?.timestamp === "string" ? new Date(this.data.timestamp) : null;
  }
  get editedTimestamp(): Date | null {
    return typeof this.data?.edited_timestamp === "string" ? new Date(this.data.edited_timestamp) : null;
  }
  get pinned(): boolean { return this.data?.pinned === true; }
  get tts(): boolean { return this.data?.tts === true; }
  get mentionEveryone(): boolean { return this.data?.mention_everyone === true; }
  get mentionedUsers(): DiscordCollection<DiscordUser> {
    const users = Array.isArray(this.data?.mentions) ? this.data.mentions : [];
    const result = new DiscordCollection<DiscordUser>();
    result.push(...users.map((user) => {
      const item = user as Json;
      return new DiscordUser(this.client, String(item.id ?? ""), item);
    }).filter((user) => user.id));
    return result;
  }
  get mentionedRoles(): DiscordCollection<DiscordMentionedRole> {
    const roles = Array.isArray(this.data?.mention_roles) ? this.data.mention_roles : [];
    const result = new DiscordCollection<DiscordMentionedRole>();
    result.push(...roles.map((role) => new DiscordMentionedRole(String(role))).filter((role) => role.id));
    return result;
  }
  get attachments(): DiscordCollection<DiscordAttachment> {
    const result = new DiscordCollection<DiscordAttachment>();
    if (!Array.isArray(this.data?.attachments)) return result;
    result.push(...this.data.attachments.map((attachment) => {
      const item = attachment as Json;
      return new DiscordAttachment(String(item.id ?? ""), item);
    }));
    return result;
  }
  get embeds(): DiscordCollection<DiscordEmbed> {
    const result = new DiscordCollection<DiscordEmbed>();
    const embeds = Array.isArray(this.data?.embeds) ? this.data.embeds : [];
    result.push(...embeds.map((embed, index) => new DiscordEmbed(`${this.id}-embed-${index}`, embed as Json)));
    return result;
  }
  get thread(): Json | null { return this.data?.thread && typeof this.data.thread === "object" ? this.data.thread as Json : null; }
  get components(): DiscordCollection<DiscordMessageComponent> {
    const result = new DiscordCollection<DiscordMessageComponent>();
    const rows = Array.isArray(this.data?.components) ? this.data.components : [];
    let componentIndex = 0;
    rows.forEach((row) => {
      const children = row && typeof row === "object" && Array.isArray((row as Json).components)
        ? (row as Json).components as Json[] : [row as Json];
      children.forEach((component) => result.push(messageComponent(component, componentIndex++)));
    });
    return result;
  }
  get poll(): DiscordPoll | null {
    return this.data?.poll && typeof this.data.poll === "object"
      ? new DiscordPoll(this.client, this.channelId, this.id, this.data.poll as Json)
      : null;
  }
  get referencedMessage(): DiscordMessage | null {
    const referenced = this.data?.referenced_message;
    if (!referenced || typeof referenced !== "object") return null;
    const messageId = String((referenced as Json).id ?? "");
    if (!messageId) return null;
    return new DiscordMessage(
      this.client,
      messageId,
      `/channels/${this.channelId}/messages/${messageId}`,
      referenced as Json,
    );
  }
  get messageSnapshots(): DiscordCollection<DiscordMessageSnapshot> {
    const result = new DiscordCollection<DiscordMessageSnapshot>();
    const snapshots = Array.isArray(this.data?.message_snapshots) ? this.data.message_snapshots : [];
    result.push(...snapshots.filter((snapshot): snapshot is Json =>
      Boolean(snapshot && typeof snapshot === "object" && typeof (snapshot as Json).id === "string"))
      .map((snapshot) => new DiscordMessageSnapshot(String(snapshot.id), snapshot)));
    return result;
  }
  get interactionMetadata(): DiscordInteractionMetadata | null {
    return this.data?.interaction_metadata && typeof this.data.interaction_metadata === "object"
      ? new DiscordInteractionMetadata(this.data.interaction_metadata as Json) : null;
  }
  constructor(
    client: DiscordRestClient,
    id: string,
    private readonly messageRoute: string,
    data?: Json,
  ) {
    super(client, id, messageRoute, data);
  }

  /** Fetches the message and retains its latest payload on the resource. */
  override fetch(): Promise<DiscordMessage> {
    return this.client.request<Json>("GET", this.messageRoute)
      .then((message) => new DiscordMessage(this.client, this.id, this.messageRoute, message));
  }

  /** Edits the message and returns the updated message resource. */
  override edit(payload: MessagePayload): Promise<DiscordMessage> {
    const files = payload.files ?? [];
    const request = files.length > 0
      ? this.client.requestMultipart<Json>("PATCH", this.messageRoute, payload, files)
      : this.client.request<Json>("PATCH", this.messageRoute, payload);
    return request
      .then((message) => new DiscordMessage(this.client, this.id, this.messageRoute, message));
  }

  /** Returns a field from the last message payload received by this resource. */
  get(key: string): unknown { return this.data?.[key]; }

  /** Fetches every reaction summary on this message. */
  getAllReactions() {
    const reactions = this.data?.reactions;
    if (!Array.isArray(reactions)) {
      throw new Error("Message reactions are unavailable; fetch the message first.");
    }

    return reactions;
  }

  /** Returns cached reaction summaries as a keyed Discord.js-like collection. */
  get reactions(): DiscordCollection<{ id: string; count?: number; me?: boolean }> {
    const raw = this.data?.reactions;
    if (!Array.isArray(raw)) throw new Error("Message reactions are unavailable; fetch the message first.");
    const result = new DiscordCollection<{ id: string; count?: number; me?: boolean }>();
    result.push(...raw.map((reaction) => {
      const item = reaction as Json;
      return {
        id: String(item.emoji && typeof item.emoji === "object" ? (item.emoji as Json).name ?? "" : ""),
        count: typeof item.count === "number" ? item.count : undefined,
        me: item.me === true,
      };
    }));
    return result;
  }

  /** Pins this message in its channel. */
  pin(): Promise<void> {
    return this.client.request<void>("PUT", `${this.messageRoute}/pins`);
  }

  /** Removes this message from the channel's pinned messages. */
  unpin(): Promise<void> {
    return this.client.request<void>("DELETE", `${this.messageRoute}/pins`);
  }

  /** Crossposts this message from a news channel. */
  crosspost(): Promise<DiscordMessage> {
    return this.client.request<Json>("POST", `${this.messageRoute}/crosspost`)
      .then((message) => new DiscordMessage(this.client, this.id, this.messageRoute, message));
  }

  /**
   * Forwards this message into another channel.
   *
   * The original message remains unchanged; Discord creates a new message in
   * the destination channel that references the original message.
   */
  forward(
    channel: DiscordChannel | string,
    options: ForwardMessageOptions = {},
  ): Promise<DiscordMessage> {
    const sourceChannelId = this.messageRoute.split("/")[2];
    const destinationChannelId = typeof channel === "string" ? channel : channel.id;
    if (!sourceChannelId) throw new Error("The source message channel ID is unavailable.");
    if (!destinationChannelId) throw new Error("A destination channel ID is required.");
    return this.client.request<Json>("POST", `/channels/${destinationChannelId}/messages`, {
      message_reference: {
        type: 1,
        message_id: this.id,
        channel_id: sourceChannelId,
      },
      fail_if_not_exists: options.failIfNotExists ?? true,
    }).then((message) => new DiscordMessage(
      this.client,
      String(message.id),
      `/channels/${destinationChannelId}/messages/${message.id}`,
      message,
    ));
  }

  /** Fetches the message referenced by this message, when one exists. */
  fetchReference(): Promise<DiscordMessage> {
    const reference = this.data?.message_reference;
    if (!reference || typeof reference !== "object" || typeof (reference as Json).message_id !== "string") {
      throw new Error("This message has no fetchable message reference.");
    }

    const ref = reference as Json;
    const channelId = String(ref.channel_id ?? this.messageRoute.split("/")[2] ?? "");
    const messageId = String(ref.message_id);
    assertSnowflake(channelId, "Reference channel ID");
    assertSnowflake(messageId, "Reference message ID");
    return this.client.request<Json>("GET", `/channels/${channelId}/messages/${messageId}`)
      .then((message) => new DiscordMessage(this.client, messageId, `/channels/${channelId}/messages/${messageId}`, message));
  }

  /** Fetches the latest poll results for this message. */
  fetchPoll(): Promise<DiscordPoll> {
    if (!this.data?.poll) throw new Error("This message does not contain a poll.");
    return new DiscordPoll(this.client, this.channelId, this.id).fetch();
  }

  /** Votes for one answer in this message's poll. */
  votePoll(answerId: number): Promise<void> {
    return new DiscordPoll(this.client, this.channelId, this.id).vote(answerId);
  }

  /** Removes the current user's vote from one poll answer. */
  removePollVote(answerId: number): Promise<void> {
    return new DiscordPoll(this.client, this.channelId, this.id).removeVote(answerId);
  }

  /** Ends this message's poll. */
  endPoll(): Promise<void> {
    return new DiscordPoll(this.client, this.channelId, this.id).end();
  }

  /**
   * Replies to this message in its channel.
   *
   * `suppressEmbeds` is converted to Discord's suppress-embeds message flag.
   */
  reply(options: MessageReplyOptions): Promise<DiscordMessage> {
    const channelId = this.messageRoute.split("/")[2];
    if (!channelId) throw new Error("The message channel ID is unavailable.");
    const { failIfNotExists, suppressEmbeds, ...payload } = options;
    const flags = Number(payload.flags ?? 0) | (suppressEmbeds ? 4 : 0);
    const messagePayload: MessagePayload = {
      ...payload,
      message_reference: {
        type: 0,
        message_id: this.id,
        channel_id: channelId,
      },
      fail_if_not_exists: failIfNotExists ?? true,
      ...(flags ? { flags } : {}),
      ...(options.files ? { files: options.files } : {}),
    };
    const request = messagePayload.files?.length
      ? this.client.requestMultipart<Json>("POST", `/channels/${channelId}/messages`, messagePayload, messagePayload.files)
      : this.client.request<Json>("POST", `/channels/${channelId}/messages`, messagePayload);
    return request.then((message) => new DiscordMessage(
      this.client,
      String(message.id),
      `/channels/${channelId}/messages/${message.id}`,
      message,
    ));
  }

  /** Suppresses or restores embeds on this message. */
  suppressEmbeds(suppress = true): Promise<DiscordMessage> {
    return this.edit({ flags: suppress ? 4 : 0 });
  }

  /** Adds a reaction and returns the Discord.js-style reaction resource. */
  react(emoji: string): Promise<DiscordMessageReaction> {
    if (!emoji.trim()) throw new Error("An emoji is required.");
    const channelId = this.messageRoute.split("/")[2];
    if (!channelId) throw new Error("The message channel ID is unavailable.");
    return this.client.request<void>(
      "PUT",
      `${this.messageRoute}/reactions/${encodeURIComponent(emoji)}/@me`,
    ).then(() => new DiscordMessageReaction(this.client, this.id, channelId, emoji, undefined, true));
  }
}
