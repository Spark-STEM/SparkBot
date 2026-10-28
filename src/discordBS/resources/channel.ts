import { DiscordResource } from "./base.ts";
import type { DiscordMessage } from "./message.ts";
import type { DiscordWebhook } from "./webhook.ts";
import type { DiscordInvite } from "./invite.ts";
import type { DiscordRestClient } from "../rest/client.ts";
import type { Json } from "../types/common.ts";
import type { MessagePayload } from "../types/common.ts";
import {
  DiscordPermissionOverwrite,
} from "./permission-overwrite.ts";
import { assertMessageContent } from "../types/validation.ts";
import type { DiscordThreadMember } from "./thread-member.ts";
import { DiscordCollection } from "../types/collections.ts";

export interface CreateThreadOptions {
  /** Thread name shown in the channel list. */
  name: string;
  /** Optional auto-archive duration in minutes. */
  autoArchiveDuration?: 60 | 1440 | 4320 | 10080;
  /** Whether the thread should be private. */
  private?: boolean;
  /** Existing message ID to which this thread should be attached. */
  messageId?: string;
  /** Optional starter message for a forum post. */
  message?: Json;
}
import { OverwriteType, type PermissionOverwrite, permissionBits, PermissionBitField } from "../types/permissions.ts";

/** A Discord channel resource with message and permission operations. */
export class DiscordChannel extends DiscordResource<Json, DiscordChannel> {
  /** The channel's Discord type, when this resource has payload data. */
  get type(): number | null { return typeof this.data?.type === "number" ? this.data.type : null; }
  /** The channel name, when this resource has payload data. */
  get name(): string | null { return typeof this.data?.name === "string" ? this.data.name : null; }
  /** The parent category ID, when the channel belongs to a category. */
  get categoryId(): string | null {
    return typeof this.data?.parent_id === "string" ? this.data.parent_id : null;
  }
  /** The per-user slow mode delay in seconds, when supplied by Discord. */
  get slowMode(): number | null {
    return typeof this.data?.rate_limit_per_user === "number" ? this.data.rate_limit_per_user : null;
  }
  get position(): number | null { return typeof this.data?.position === "number" ? this.data.position : null; }
  get topic(): string | null { return typeof this.data?.topic === "string" ? this.data.topic : null; }
  get nsfw(): boolean { return this.data?.nsfw === true; }
  get bitrate(): number | null { return typeof this.data?.bitrate === "number" ? this.data.bitrate : null; }
  get userLimit(): number | null { return typeof this.data?.user_limit === "number" ? this.data.user_limit : null; }
  get flags(): number | null { return typeof this.data?.flags === "number" ? this.data.flags : null; }

  /** Returns this channel as its text-capable interface for voice/stage channels. */
  get text() { return this; }

  override fetch(): Promise<DiscordChannel> {
    return this.client.request<Json>("GET", this.route)
      .then((channel) => new DiscordChannel(this.client, this.id, channel));
  }

  override edit(payload: Json): Promise<DiscordChannel> {
    return this.client.request<Json>("PATCH", this.route, payload)
      .then((channel) => new DiscordChannel(this.client, this.id, channel));
  }

  /** Lists active threads or forum posts associated with this channel. */
  fetchPosts(): Promise<DiscordCollection<DiscordChannel>> {
    return this.client.request<{ threads?: Json[] }>("GET", `/channels/${this.id}/threads/active`)
      .then((response) => new DiscordCollection<DiscordChannel>(...(response.threads ?? []).map((thread) =>
        new DiscordChannel(this.client, String(thread.id), thread))));
  }

  /** Fetches archived threads for this channel. */
  fetchArchivedThreads(options: {
    private?: boolean;
    joined?: boolean;
    before?: string;
    limit?: number;
  } = {}): Promise<DiscordCollection<DiscordChannel>> {
    const visibility = options.private ? "private" : "public";
    const params = new URLSearchParams();
    if (options.joined !== undefined) params.set("joined", String(options.joined));
    if (options.before) params.set("before", options.before);
    if (options.limit !== undefined) params.set("limit", String(options.limit));
    const suffix = params.size ? `?${params}` : "";
    return this.client.request<{ threads?: Json[] }>(
      "GET", `/channels/${this.id}/threads/archived/${visibility}${suffix}`,
    ).then((response) => new DiscordCollection<DiscordChannel>(...(response.threads ?? []).map((thread) =>
      new DiscordChannel(this.client, String(thread.id), thread))));
  }

  /** Fetches an individual forum post or thread by ID. */
  fetchPost(postId: string): Promise<DiscordChannel> {
    if (!postId) throw new Error("A post or thread ID is required.");
    return this.client.request<Json>("GET", `/channels/${postId}`)
      .then((thread) => new DiscordChannel(this.client, postId, thread));
  }

  /** Fetches the starter message for a thread when Discord exposes it. */
  fetchThreadStarterMessage(): Promise<DiscordMessage> {
    return this.fetchMessage(this.id);
  }

  /** Creates a forum post or thread and returns its channel resource. */
  createPost(options: CreateThreadOptions): Promise<DiscordChannel> {
    if (!options.name.trim()) throw new Error("A post or thread name is required.");
    const payload = {
      name: options.name,
      ...(options.autoArchiveDuration === undefined ? {} : { auto_archive_duration: options.autoArchiveDuration }),
      ...(options.private === undefined ? {} : { type: options.private ? 12 : 11 }),
      ...(options.messageId === undefined ? {} : { message_id: options.messageId }),
      ...(options.message === undefined ? {} : { message: options.message }),
    };
    return this.client.request<Json>("POST", `/channels/${this.id}/threads`, payload)
      .then((thread) => new DiscordChannel(this.client, String(thread.id), thread));
  }

  /** Creates a public thread without requiring a Discord channel type number. */
  createThread(options: CreateThreadOptions): Promise<DiscordChannel> {
    return this.createPost({ ...options, private: false });
  }

  /** Locks or unlocks this thread. */
  setLocked(locked = true): Promise<DiscordChannel> {
    return this.edit({ locked }).then((thread) => new DiscordChannel(this.client, this.id, thread.raw));
  }

  /** Archives or unarchives this thread. */
  setArchived(archived = true): Promise<DiscordChannel> {
    return this.edit({ archived }).then((thread) => new DiscordChannel(this.client, this.id, thread.raw));
  }

  /** Fetches members currently participating in this thread. */
  fetchThreadMembers(): Promise<DiscordCollection<DiscordThreadMember>> {
    return this.client.request<Json[]>("GET", `/channels/${this.id}/thread-members`)
      .then(async (members) => {
        const { DiscordThreadMember } = await import("./thread-member.ts");
        return new DiscordCollection<DiscordThreadMember>(...members.map((member) =>
          new DiscordThreadMember(this.client, member)));
      });
  }

  /** Fetches all permission overwrites configured on this channel. */
  fetchPermissionOverwrites(): Promise<DiscordCollection<DiscordPermissionOverwrite>> {
    return this.client.request<Json[]>("GET", `/channels/${this.id}/permissions`)
      .then((items) => new DiscordCollection<DiscordPermissionOverwrite>(...items.map((item) => {
        const type = item.type === 0 ? OverwriteType.Role
          : item.type === 1 ? OverwriteType.Member
          : null;
        if (!type) throw new Error(`Unknown permission overwrite type for ${String(item.id)}.`);
        return new DiscordPermissionOverwrite(this.client, this.id, String(item.id), type, item);
      })));
  }

  /** Resolves effective channel permissions from base permissions and overwrites. */
  async resolvePermissions(options: {
    base: PermissionBitField;
    userId: string;
    roleIds: readonly string[];
    everyoneRoleId?: string;
  }): Promise<PermissionBitField> {
    const overwrites = await this.fetchPermissionOverwrites();
    let bits = options.base.bitfield;
    const apply = (allow: string, deny: string) => {
      bits = (bits & ~BigInt(deny)) | BigInt(allow);
    };
    const everyone = overwrites.find((item) =>
      item.type === OverwriteType.Role && item.id === options.everyoneRoleId);
    if (everyone) apply(everyone.allow, everyone.deny);
    const roles = overwrites.filter((item) =>
      item.type === OverwriteType.Role && options.roleIds.includes(item.id) && item.id !== options.everyoneRoleId);
    bits = (bits & ~roles.reduce((value, item) => value | BigInt(item.deny), 0n)) |
      roles.reduce((value, item) => value | BigInt(item.allow), 0n);
    const member = overwrites.find((item) => item.type === OverwriteType.Member && item.id === options.userId);
    if (member) apply(member.allow, member.deny);
    return new PermissionBitField(bits);
  }

  /** Fetches one channel permission overwrite. */
  fetchPermissionOverwrite(
    target: { type: OverwriteType.Role; id: string },
  ): Promise<DiscordPermissionOverwrite<OverwriteType.Role>>;
  fetchPermissionOverwrite(
    target: { type: OverwriteType.Member; id: string },
  ): Promise<DiscordPermissionOverwrite<OverwriteType.Member>>;
  fetchPermissionOverwrite(target: { type: OverwriteType; id: string }): Promise<DiscordPermissionOverwrite> {
    if (!target.id) throw new Error("A permission overwrite ID is required.");
    return this.fetchPermissionOverwrites().then((items) => {
      const item = items.find((overwrite) =>
        overwrite.id === target.id && overwrite.type === target.type);
      if (!item) {
        throw new Error(
          `Permission overwrite ${target.type} ${target.id} was not found on channel ${this.id}.`,
        );
      }
      return new DiscordPermissionOverwrite(
        this.client, this.id, item.id, target.type, item.raw,
      );
    });
  }

  /** Joins the current user to this thread. */
  join(): Promise<void> {
    return this.client.request<void>("PUT", `/channels/${this.id}/thread-members/@me`);
  }

  /** Removes the current user from this thread. */
  leave(): Promise<void> {
    return this.client.request<void>("DELETE", `/channels/${this.id}/thread-members/@me`);
  }

  /** Adds a user to this thread. */
  addMember(userId: string): Promise<void> {
    if (!userId) throw new Error("A thread member ID is required.");
    return this.client.request<void>("PUT", `/channels/${this.id}/thread-members/${userId}`);
  }

  /** Removes a user from this thread. */
  removeMember(userId: string): Promise<void> {
    if (!userId) throw new Error("A thread member ID is required.");
    return this.client.request<void>("DELETE", `/channels/${this.id}/thread-members/${userId}`);
  }

  constructor(client: DiscordRestClient, id: string, data?: Json) {
    super(client, id, `/channels/${id}`, data);
  }

  /** Sets or clears this channel's per-user slow mode delay. */
  setSlowMode(seconds: number): Promise<DiscordChannel> {
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) {
      throw new Error("Slow mode must be an integer between 0 and 21600 seconds.");
    }
    return this.edit({ rate_limit_per_user: seconds })
      .then((channel) => new DiscordChannel(this.client, this.id, channel.raw));
  }

  /** Fetches a message from this channel. */
  fetchMessage(messageId: string): Promise<DiscordMessage> {
    return this.client.request<Json>("GET", `/channels/${this.id}/messages/${messageId}`)
      .then(async (message) => {
        const { DiscordMessage } = await import("./message.ts");
        return new DiscordMessage(this.client, messageId, `/channels/${this.id}/messages/${messageId}`, message);
      });
  }

  /** Fetches messages in reverse chronological order. */
  fetchMessages(options: { around?: string; before?: string; after?: string; limit?: number } = {}): Promise<DiscordCollection<DiscordMessage>> {
    const params = new URLSearchParams();
    for (const key of ["around", "before", "after"] as const) {
      if (options[key]) params.set(key, options[key]!);
    }
    if (options.limit !== undefined) params.set("limit", String(options.limit));
    const suffix = params.size ? `?${params}` : "";
    return this.client.request<Json[]>("GET", `/channels/${this.id}/messages${suffix}`)
      .then(async (messages) => {
        const { DiscordMessage } = await import("./message.ts");
        return new DiscordCollection<DiscordMessage>(...messages.map((message) =>
          new DiscordMessage(this.client, String(message.id), `/channels/${this.id}/messages/${message.id}`, message)));
      });
  }

  /** Bulk-deletes messages in this channel. */
  bulkDelete(messageIds: string[]): Promise<void> {
    if (messageIds.length < 2 || messageIds.length > 100) {
      throw new Error("Bulk deletion requires between 2 and 100 message IDs.");
    }
    return this.client.request<void>("POST", `/channels/${this.id}/messages/bulk-delete`, { messages: messageIds });
  }

  /** Fetches pinned messages from this channel. */
  fetchPins(): Promise<DiscordCollection<DiscordMessage>> {
    return this.client.request<Json[]>("GET", `/channels/${this.id}/pins`)
      .then(async (messages) => {
        const { DiscordMessage } = await import("./message.ts");
        return new DiscordCollection<DiscordMessage>(...messages.map((message) =>
          new DiscordMessage(this.client, String(message.id), `/channels/${this.id}/messages/${message.id}`, message)));
      });
  }

  /** Creates a webhook in this channel. */
  createWebhook(payload: Json): Promise<DiscordWebhook> {
    return this.client.request<Json>("POST", `/channels/${this.id}/webhooks`, payload)
      .then(async (webhook) => {
        const { DiscordWebhook } = await import("./webhook.ts");
        return new DiscordWebhook(this.client, String(webhook.id), `/webhooks/${webhook.id}`, webhook);
      });
  }

  /** Fetches every webhook attached to this channel. */
  fetchWebhooks(): Promise<DiscordCollection<DiscordWebhook>> {
    return this.client.request<Json[]>("GET", `/channels/${this.id}/webhooks`)
      .then(async (webhooks) => {
        const { DiscordWebhook } = await import("./webhook.ts");
        return new DiscordCollection<DiscordWebhook>(...webhooks.map((webhook) =>
          new DiscordWebhook(this.client, String(webhook.id), `/webhooks/${webhook.id}`, webhook)));
      });
  }

  /** Creates an invite for this channel. */
  createInvite(payload: Json = {}): Promise<DiscordInvite> {
    return this.client.request<Json>("POST", `/channels/${this.id}/invites`, payload)
      .then(async (invite) => {
        const { DiscordInvite } = await import("./invite.ts");
        return new DiscordInvite(this.client, String(invite.code), invite);
      });
  }

  /** Sends a message to this channel and wraps the returned message. */
  sendMessage(payload: MessagePayload): Promise<DiscordMessage> {
    if (typeof payload.content === "string") assertMessageContent(payload.content);
    const files = payload.files ?? [];
    const request = files.length > 0
      ? this.client.requestMultipart<Json>("POST", `/channels/${this.id}/messages`, payload, files)
      : this.client.request<Json>("POST", `/channels/${this.id}/messages`, payload);
    return request
      .then(async (message) => {
        const { DiscordMessage } = await import("./message.ts");
        return new DiscordMessage(this.client, String(message.id), `/channels/${this.id}/messages/${message.id}`, message);
      });
  }

  /** Lazily iterates through all channel messages using Discord pagination. */
  async *messages(options: { limit?: number; before?: string; after?: string } = {}): AsyncGenerator<DiscordMessage> {
    let before = options.before;
    const pageSize = Math.min(Math.max(options.limit ?? 100, 1), 100);
    while (true) {
      const page = await this.fetchMessages({ limit: pageSize, before, after: options.after });
      for (const message of page) yield message;
      if (page.length < pageSize) return;
      before = page[page.length - 1]?.id;
      if (!before) return;
    }
  }

  /** Sets or replaces a permission overwrite for a role or member. */
  editPermissions(permissions: PermissionOverwrite): Promise<void> {
    return this.client.request<void>("PUT", `/channels/${this.id}/permissions/${permissions.id}`, {
      id: permissions.id,
      type: permissions.type === OverwriteType.Role ? 0 : 1,
      allow: permissionBits(permissions.allow),
      deny: permissionBits(permissions.deny),
    });
  }

  /** Removes the permission overwrite belonging to a role or member. */
  deletePermissionOverwrite(target: Pick<PermissionOverwrite, "type" | "id">): Promise<void> {
    return this.client.request<void>("DELETE", `/channels/${this.id}/permissions/${target.id}`);
  }
}
