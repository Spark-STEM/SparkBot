import { DiscordResource } from "./base.ts";
import { DiscordChannel } from "./channel.ts";
import { DiscordMember } from "./member.ts";
import { DiscordRole } from "./role.ts";
import type { DiscordRestClient } from "../rest/client.ts";
import type { Json, ChannelType } from "../types/common.ts";
import { DiscordInvite } from "./invite.ts";
import { DiscordWebhook } from "./webhook.ts";
import { DiscordCollection } from "../types/collections.ts";
import { DiscordEmoji } from "./emoji.ts";
import { DiscordSticker } from "./sticker.ts";
import { DiscordAuditLogEntry } from "./audit-log.ts";
import { DiscordBan } from "./ban.ts";
import { GuildChannelManager, GuildMemberManager, GuildRoleManager } from "./managers.ts";
import { DiscordPaginator } from "../types/pagination.ts";
import { DiscordScheduledEvent, type ScheduledEventOptions } from "./scheduled-event.ts";
import { DiscordAutoModerationRule } from "./auto-moderation.ts";

/** Options for creating or updating a scheduled event. */
/** Input accepted by guild channel creation. */
export interface CreateChannelOptions {
  type: ChannelType;
  name: string;
  categoryId?: string;
}

export interface BanQuery {
  limit?: number;
  before?: string;
  after?: string;
}

/** A Discord guild resource that creates and fetches guild-scoped resources. */
export class DiscordGuild extends DiscordResource<Json, DiscordGuild> {
  readonly channels: GuildChannelManager;
  readonly roles: GuildRoleManager;
  readonly membersManager: GuildMemberManager;
  /** The guild's name, when this resource has been fetched. */
  get name(): string | null { return typeof this.data?.name === "string" ? this.data.name : null; }
  /** The guild icon hash, when one is set. */
  private get icon(): string | null { return typeof this.data?.icon === "string" ? this.data.icon : null; }
  /** The guild icon CDN URL, or null when no icon is set. */
  get iconURL(): string | null {
    return this.icon ? `https://cdn.discordapp.com/icons/${this.id}/${this.icon}.png?size=4096` : null;
  }
  get ownerId(): string | null { return typeof this.data?.owner_id === "string" ? this.data.owner_id : null; }
  get memberCount(): number | null { return typeof this.data?.approximate_member_count === "number" ? this.data.approximate_member_count : null; }
  get verificationLevel(): number | null { return typeof this.data?.verification_level === "number" ? this.data.verification_level : null; }
  get preferredLocale(): string | null { return typeof this.data?.preferred_locale === "string" ? this.data.preferred_locale : null; }
  get features(): string[] {
    return Array.isArray(this.data?.features)
      ? this.data.features.filter((feature): feature is string => typeof feature === "string")
      : [];
  }

  /** Fetches every custom emoji in this guild. */
  fetchEmojis(): Promise<DiscordCollection<DiscordEmoji>> {
    return this.client.request<Json[]>("GET", `/guilds/${this.id}/emojis`)
      .then((emojis) => {
        const result = new DiscordCollection<DiscordEmoji>();
        result.push(...emojis.map((emoji) => new DiscordEmoji(this.client, this.id, String(emoji.id), emoji)));
        return result;
      });
  }

  /** Fetches one custom emoji. */
  fetchEmoji(emojiId: string): Promise<DiscordEmoji> {
    if (!emojiId) throw new Error("An emoji ID is required.");
    return new DiscordEmoji(this.client, this.id, emojiId).fetch();
  }

  /** Creates a custom emoji from a base64/data URI image. */
  createEmoji(payload: Json): Promise<DiscordEmoji> {
    if (typeof payload.name !== "string" || !payload.name.trim()) {
      throw new Error("A custom emoji name is required.");
    }
    if (typeof payload.image !== "string" || !payload.image.trim()) {
      throw new Error("A custom emoji image data URI is required.");
    }
    return this.client.request<Json>("POST", `/guilds/${this.id}/emojis`, payload)
      .then((emoji) => new DiscordEmoji(this.client, this.id, String(emoji.id), emoji));
  }

  /** Fetches every custom sticker in this guild. */
  fetchStickers(): Promise<DiscordCollection<DiscordSticker>> {
    return this.client.request<Json[]>("GET", `/guilds/${this.id}/stickers`)
      .then((stickers) => {
        const result = new DiscordCollection<DiscordSticker>();
        result.push(...stickers.map((sticker) => new DiscordSticker(this.client, this.id, String(sticker.id), sticker)));
        return result;
      });
  }

  /** Fetches one custom sticker. */
  fetchSticker(stickerId: string): Promise<DiscordSticker> {
    if (!stickerId) throw new Error("A sticker ID is required.");
    return new DiscordSticker(this.client, this.id, stickerId).fetch();
  }

  /** Creates a guild sticker using Discord's sticker-create payload. */
  createSticker(payload: Json): Promise<DiscordSticker> {
    if (typeof payload.name !== "string" || !payload.name.trim()) {
      throw new Error("A sticker name is required.");
    }
    return this.client.request<Json>("POST", `/guilds/${this.id}/stickers`, payload)
      .then((sticker) => new DiscordSticker(this.client, this.id, String(sticker.id), sticker));
  }

  /** Returns a lazy channel reference without making a network request. */
  getChannel(channelId: string): DiscordChannel {
    if (!channelId) throw new Error("A channel ID is required.");
    return new DiscordChannel(this.client, channelId);
  }

  /** Returns a lazy role reference scoped to this guild. */
  getRole(roleId: string): DiscordRole {
    if (!roleId) throw new Error("A role ID is required.");
    return new DiscordRole(this.client, this.id, roleId);
  }

  /** Returns a lazy member reference scoped to this guild. */
  getMember(userId: string): DiscordMember {
    if (!userId) throw new Error("A member ID is required.");
    return new DiscordMember(this.client, this.id, userId);
  }

  /** Fetches this guild and returns a resource retaining its guild-scoped factories. */
  override fetch(): Promise<DiscordGuild> {
    return this.client.request<Json>("GET", this.route)
      .then((guild) => new DiscordGuild(this.client, this.id, guild));
  }

  /** Fetches every role in this guild. */
  fetchRoles(): Promise<DiscordCollection<DiscordRole>> {
    return this.client.request<Json[]>("GET", `/guilds/${this.id}/roles`)
      .then((roles) => {
        const result = new DiscordCollection<DiscordRole>();
        result.push(...roles.map((role) => new DiscordRole(this.client, this.id, String(role.id), role)));
        return result;
      });
  }

  /** Fetches a paginated member batch from this guild. */
  fetchMembers(query: { limit?: number; after?: string } = {}): Promise<DiscordCollection<DiscordMember>> {
    const params = new URLSearchParams();
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    if (query.after) params.set("after", query.after);
    const suffix = params.size ? `?${params}` : "";
    return this.client.request<Json[]>("GET", `/guilds/${this.id}/members${suffix}`)
      .then((members) => new DiscordCollection<DiscordMember>(...members.map((member) => {
        const user = member.user as Json | undefined;
        return new DiscordMember(this.client, this.id, String(user?.id ?? member.id), member);
      })));
  }

  /** Lazily iterates through all guild members using the `after` cursor. */
  async *members(options: { pageSize?: number } = {}): AsyncGenerator<DiscordMember> {
    const pageSize = Math.min(Math.max(options.pageSize ?? 1000, 1), 1000);
    let after: string | undefined;
    while (true) {
      const page = await this.fetchMembers({ limit: pageSize, after });
      for (const member of page) yield member;
      if (page.length < pageSize) return;
      after = page[page.length - 1]?.id;
      if (!after) return;
    }
  }

  paginateMembers(options: { pageSize?: number; maxItems?: number; signal?: AbortSignal } = {}): DiscordPaginator<DiscordMember> {
    const pageSize = Math.min(Math.max(options.pageSize ?? 1000, 1), 1000);
    return new DiscordPaginator(async (after) => {
      const items = await this.membersManager.fetchAll({ limit: pageSize, after });
      return { items, nextCursor: items.last()?.id };
    }, options);
  }

  /** Updates a member's guild voice state. */
  editVoiceState(userId: string, payload: Json): Promise<void> {
    if (!userId) throw new Error("A voice-state member ID is required.");
    return this.client.request<void>("PATCH", `/guilds/${this.id}/voice-states/${userId}`, payload);
  }

  /** Fetches every channel in this guild. */
  fetchChannels(): Promise<DiscordCollection<DiscordChannel>> {
    return this.client.request<Json[]>("GET", `/guilds/${this.id}/channels`)
      .then((channels) => {
        const result = new DiscordCollection<DiscordChannel>();
        result.push(...channels.map((channel) => new DiscordChannel(this.client, String(channel.id), channel)));
        return result;
      });
  }

  /** Fetches one member from this guild. */
  fetchMember(userId: string): Promise<DiscordMember> {
    return new DiscordMember(this.client, this.id, userId).fetch();
  }

  /** Fetches one role from this guild. */
  fetchRole(roleId: string): Promise<DiscordRole> {
    return new DiscordRole(this.client, this.id, roleId).fetch();
  }

  /** Fetches audit-log entries, optionally filtered by action or target. */
  fetchAuditLogs(options: { limit?: number; before?: string; after?: string; userId?: string; actionType?: number } = {}): Promise<DiscordCollection<DiscordAuditLogEntry>> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set("limit", String(options.limit));
    if (options.before) params.set("before", options.before);
    if (options.after) params.set("after", options.after);
    if (options.userId) params.set("user_id", options.userId);
    if (options.actionType !== undefined) params.set("action_type", String(options.actionType));
    const suffix = params.size ? `?${params}` : "";
    return this.client.request<{ audit_log_entries: Json[] }>("GET", `/guilds/${this.id}/audit-logs${suffix}`)
      .then((response) => {
        const result = new DiscordCollection<DiscordAuditLogEntry>();
        result.push(...response.audit_log_entries.map((entry) =>
          new DiscordAuditLogEntry(this.client, this.id, String(entry.id), entry)));
        return result;
      });
  }

  /** Lazily iterates through audit-log pages. */
  async *auditLogs(options: {
    limit?: number;
    after?: string;
    userId?: string;
    actionType?: number;
  } = {}): AsyncGenerator<DiscordAuditLogEntry> {
    let before: string | undefined;
    while (true) {
      const page = await this.fetchAuditLogs({ ...options, before });
      for (const entry of page) yield entry;
      if (page.length < (options.limit ?? 50)) return;
      before = page[page.length - 1]?.id;
      if (!before) return;
    }
  }

  /** Options controlling removal of inactive members. */
  pruneMembers(options: {
    days: number;
    computePruneCount?: boolean;
    reason?: string;
  }): Promise<number | null> {
    if (!Number.isInteger(options.days) || options.days < 1 || options.days > 30) {
      throw new Error("Prune days must be an integer between 1 and 30.");
    }
    return this.client.request<{ pruned?: number }>("POST", `/guilds/${this.id}/prune`, {
      days: options.days,
      compute_prune_count: options.computePruneCount ?? false,
    }, options.reason ? { "X-Audit-Log-Reason": options.reason } : undefined)
      .then((result) => options.computePruneCount ? result.pruned ?? null : null);
  }

  /** Updates guild settings and returns the refreshed guild resource. */
  override edit(payload: Json): Promise<DiscordGuild> {
    return this.client.request<Json>("PATCH", this.route, payload)
      .then((guild) => new DiscordGuild(this.client, this.id, guild));
  }

  /** Fetches webhooks owned by this guild. */
  fetchWebhooks(): Promise<DiscordCollection<DiscordWebhook>> {
    return this.client.request<Json[]>("GET", `/guilds/${this.id}/webhooks`)
      .then((webhooks) => new DiscordCollection<DiscordWebhook>(...webhooks.map((webhook) =>
        new DiscordWebhook(this.client, String(webhook.id), `/webhooks/${webhook.id}`, webhook))));
  }

  /** Fetches an invite by code. */
  fetchInvite(code: string): Promise<DiscordInvite> {
    if (!code) throw new Error("An invite code is required.");
    return new DiscordInvite(this.client, code).fetch();
  }

  /** Fetches invites created for this guild. */
  fetchInvites(): Promise<DiscordCollection<DiscordInvite>> {
    return this.client.request<Json[]>("GET", `/guilds/${this.id}/invites`)
      .then((invites) => new DiscordCollection<DiscordInvite>(...invites
        .filter((invite) => typeof invite.code === "string")
        .map((invite) => new DiscordInvite(this.client, String(invite.code), invite))));
  }

  /** Fetches a page of guild bans. */
  fetchBans(query: BanQuery = {}): Promise<DiscordCollection<DiscordBan>> {
    const params = new URLSearchParams();
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    if (query.before) params.set("before", query.before);
    if (query.after) params.set("after", query.after);
    const suffix = params.size ? `?${params}` : "";
    return this.client.request<Json[]>("GET", `/guilds/${this.id}/bans${suffix}`)
      .then((bans) => {
        const result = new DiscordCollection<DiscordBan>();
        result.push(...bans.map((ban) => new DiscordBan(this.client, ban)));
        return result;
      });
  }

  /** Fetches one guild ban. */
  fetchBan(userId: string): Promise<DiscordBan> {
    if (!userId) throw new Error("A banned user ID is required.");
    return this.client.request<Json>("GET", `/guilds/${this.id}/bans/${userId}`)
      .then((ban) => new DiscordBan(this.client, ban));
  }

  /** Creates a guild ban. */
  createBan(options: { userId: string; deleteMessageSeconds?: number; reason?: string }): Promise<void> {
    if (!options.userId) throw new Error("A banned user ID is required.");
    if (options.deleteMessageSeconds !== undefined &&
      (!Number.isInteger(options.deleteMessageSeconds) || options.deleteMessageSeconds < 0 || options.deleteMessageSeconds > 604800)) {
      throw new Error("Deleted ban message seconds must be between 0 and 604800.");
    }
    return this.client.request<void>("PUT", `/guilds/${this.id}/bans/${options.userId}`, {
      ...(options.deleteMessageSeconds === undefined ? {} : { delete_message_seconds: options.deleteMessageSeconds }),
    }, options.reason ? { "X-Audit-Log-Reason": options.reason } : undefined);
  }

  /** Removes a guild ban. */
  removeBan(options: { userId: string; reason?: string }): Promise<void> {
    if (!options.userId) throw new Error("A banned user ID is required.");
    return this.client.request<void>("DELETE", `/guilds/${this.id}/bans/${options.userId}`, undefined,
      options.reason ? { "X-Audit-Log-Reason": options.reason } : undefined);
  }

  /** Lazily iterates through all guild bans. */
  async *bans(options: Omit<BanQuery, "before"> = {}): AsyncGenerator<DiscordBan> {
    let before: string | undefined;
    const limit = Math.min(Math.max(options.limit ?? 1000, 1), 1000);
    while (true) {
      const page = await this.fetchBans({ ...options, limit, before });
      for (const ban of page) yield ban;
      if (page.length < limit) return;
      const last = page[page.length - 1];
      before = last?.id || undefined;
      if (!before) return;
    }
  }

  /** Lazily iterates through guild invites. */
  async *invites(): AsyncGenerator<DiscordInvite> {
    for (const invite of await this.fetchInvites()) yield invite;
  }

  /** Fetches scheduled events configured for this guild. */
  fetchScheduledEvents(): Promise<DiscordCollection<DiscordScheduledEvent>> {
    return this.client.request<Json[]>("GET", `/guilds/${this.id}/scheduled-events`)
      .then((events) => new DiscordCollection<DiscordScheduledEvent>(...events.map((event) =>
        new DiscordScheduledEvent(this.client, this.id, String(event.id), event))));
  }

  /** Fetches one scheduled event. */
  fetchScheduledEvent(eventId: string): Promise<DiscordScheduledEvent> {
    if (!eventId) throw new Error("A scheduled event ID is required.");
    return new DiscordScheduledEvent(this.client, this.id, eventId).fetch();
  }

  /** Creates a scheduled event. */
  createScheduledEvent(options: ScheduledEventOptions): Promise<DiscordScheduledEvent> {
    if (!options.name.trim()) throw new Error("A scheduled event name is required.");
    return this.client.request<Json>("POST", `/guilds/${this.id}/scheduled-events`, {
      name: options.name,
      scheduled_start_time: options.scheduledStartTime,
      entity_type: options.entityType,
      ...(options.privacyLevel === undefined ? {} : { privacy_level: options.privacyLevel }),
      ...(options.scheduledEndTime ? { scheduled_end_time: options.scheduledEndTime } : {}),
      ...(options.description === undefined ? {} : { description: options.description }),
      ...(options.channelId === undefined ? {} : { channel_id: options.channelId }),
      ...(options.entityMetadata === undefined ? {} : { entity_metadata: options.entityMetadata }),
    }).then((event) => new DiscordScheduledEvent(this.client, this.id, String(event.id), event));
  }

  /** Updates a scheduled event. */
  editScheduledEvent(eventId: string, payload: Json): Promise<DiscordScheduledEvent> {
    if (!eventId) throw new Error("A scheduled event ID is required.");
    return new DiscordScheduledEvent(this.client, this.id, eventId).edit(payload);
  }

  /** Deletes a scheduled event. */
  deleteScheduledEvent(eventId: string): Promise<void> {
    if (!eventId) throw new Error("A scheduled event ID is required.");
    return this.client.request<void>("DELETE", `/guilds/${this.id}/scheduled-events/${eventId}`);
  }

  /** Fetches auto moderation rules configured for this guild. */
  fetchAutoModRules(): Promise<DiscordCollection<DiscordAutoModerationRule>> {
    return this.client.request<Json[]>("GET", `/guilds/${this.id}/auto-moderation/rules`)
      .then((rules) => new DiscordCollection<DiscordAutoModerationRule>(...rules.map((rule) =>
        new DiscordAutoModerationRule(this.client, this.id, String(rule.id), rule))));
  }

  /** Fetches one auto moderation rule. */
  fetchAutoModRule(ruleId: string): Promise<DiscordAutoModerationRule> {
    if (!ruleId) throw new Error("An auto moderation rule ID is required.");
    return new DiscordAutoModerationRule(this.client, this.id, ruleId).fetch();
  }

  /** Creates an auto moderation rule. */
  createAutoModRule(payload: Json): Promise<DiscordAutoModerationRule> {
    return this.client.request<Json>("POST", `/guilds/${this.id}/auto-moderation/rules`, payload)
      .then((rule) => new DiscordAutoModerationRule(this.client, this.id, String(rule.id), rule));
  }

  /** Updates an auto moderation rule. */
  editAutoModRule(ruleId: string, payload: Json): Promise<DiscordAutoModerationRule> {
    if (!ruleId) throw new Error("An auto moderation rule ID is required.");
    return new DiscordAutoModerationRule(this.client, this.id, ruleId).edit(payload);
  }

  /** Deletes an auto moderation rule. */
  deleteAutoModRule(ruleId: string): Promise<void> {
    if (!ruleId) throw new Error("An auto moderation rule ID is required.");
    return this.client.request<void>("DELETE", `/guilds/${this.id}/auto-moderation/rules/${ruleId}`);
  }


  /** Creates a role in this guild. */
  createRole(payload: Json = {}): Promise<DiscordRole> {
    return this.client.request<Json>("POST", `/guilds/${this.id}/roles`, payload)
      .then((role) => new DiscordRole(this.client, this.id, String(role.id), role));
  }

  /**
   * Creates a text, voice, or category channel.
   *
   * Discord does not allow categories to have a parent category, so a
   * `categoryId` with `ChannelType.Category` is rejected before any request.
   * @param options Channel type, name, and optional parent category.
   * @returns The newly created channel resource.
   */
  createChannel(options: CreateChannelOptions): Promise<DiscordChannel> {
    if (!options.name.trim()) throw new Error("A channel name is required.");
    if (!["text", "voice", "category", "announcement", "forum", "stage"].includes(options.type)) {
      throw new Error(`Unsupported channel type: ${String(options.type)}`);
    }
    if (options.type === "category" && options.categoryId !== undefined) {
      throw new Error("A category cannot be created inside another category.");
    }
    const type = options.type === "text" ? 0
      : options.type === "voice" ? 2
      : options.type === "category" ? 4
      : options.type === "announcement" ? 5
      : options.type === "stage" ? 13
      : 15;
    return this.client.request<Json>("POST", `/guilds/${this.id}/channels`, {
      name: options.name,
      type,
      ...(options.categoryId ? { parent_id: options.categoryId } : {}),
    }).then((channel) => new DiscordChannel(this.client, String(channel.id), channel));
  }

  constructor(client: DiscordRestClient, id: string, data?: Json) {
    super(client, id, `/guilds/${id}`, data);
    this.channels = new GuildChannelManager(client, id);
    this.roles = new GuildRoleManager(client, id);
    this.membersManager = new GuildMemberManager(client, id);
  }
}
