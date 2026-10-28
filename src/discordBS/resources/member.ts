import { DiscordResource } from "./base.ts";
import { DiscordUser } from "./user.ts";
import type { DiscordRestClient } from "../rest/client.ts";
import type { Json } from "../types/common.ts";
import type { PermissionFlag } from "../types/permissions.ts";
import { PermissionBitField } from "../types/permissions.ts";

export interface BanMemberOptions {
  /** Number of seconds of recent messages Discord should remove. */
  deleteMessageSeconds?: number;
  /** Optional audit-log reason for the ban. */
  reason?: string;
}

export interface TimeoutOptions {
  /** The timeout end time; `null` removes an existing timeout. */
  until: Date | null;
  /** Optional audit-log reason for the change. */
  reason?: string;
}

/** A guild member resource with profile, role, and moderation operations. */
export class DiscordMember extends DiscordResource<Json, DiscordMember> {
  private get memberData(): Json { return this.data ?? {}; }
  /** The underlying user resource, when Discord included user data. */
  get user(): DiscordUser {
    const user = this.memberData.user as Json | undefined;
    return new DiscordUser(this.client, String(user?.id ?? this.id), user);
  }
  /** The member's user ID. */
  get userId(): string { return this.id; }
  /** The member's global username, when Discord included user data. */
  get name(): string | null { return this.user.name; }
  /** The member's username, when Discord included user data. */
  get username(): string | null { return this.user.username; }
  /** The member's global display name, when Discord included user data. */
  get globalName(): string | null { return this.user.globalName; }
  /** The member's effective display name: nickname, global name, or username. */
  get displayName(): string | null { return this.nickname ?? this.user.globalName ?? this.username; }
  /** Whether the underlying Discord account is a bot. */
  get bot(): boolean { return this.user.bot; }
  get system(): boolean { return this.user.system; }
  get publicFlags(): number | null { return this.user.publicFlags; }
  get accentColor(): number | null { return this.user.accentColor; }
  /** The member's join timestamp, when Discord included it. */
  get joinedAt(): Date | null {
    const value = this.memberData.joined_at;
    return typeof value === "string" ? new Date(value) : null;
  }
  /** Whether this member is awaiting completion of the guild membership screening. */
  get pending(): boolean { return this.memberData.pending === true; }
  /** The member's server nickname, or null when none is set. */
  get nickname(): string | null {
    return typeof this.memberData.nick === "string" ? this.memberData.nick : null;
  }
  /** The member's server avatar hash, when one is set. */
  private get avatar(): string | null {
    return typeof this.memberData.avatar === "string" ? this.memberData.avatar : null;
  }
  /** The member's server avatar CDN URL, or the user's avatar URL as fallback. */
  get avatarURL(): string | null {
    return this.avatar
      ? `https://cdn.discordapp.com/guilds/${this.guildId}/users/${this.id}/avatars/${this.avatar}.png?size=4096`
      : this.user.avatarURL;
  }
  /** Role IDs currently assigned to the member. */
  get roles(): string[] {
    return Array.isArray(this.memberData.roles)
      ? this.memberData.roles.filter((role): role is string => typeof role === "string")
      : [];
  }
  /** Whether the member is currently server-muted. */
  get communicationDisabledUntil(): Date | null {
    const value = this.memberData.communication_disabled_until;
    return typeof value === "string" ? new Date(value) : null;
  }
  get joinedTimestamp(): number | null { return this.joinedAt?.getTime() ?? null; }
  get premiumSince(): Date | null {
    const value = this.memberData.premium_since;
    return typeof value === "string" ? new Date(value) : null;
  }
  get flags(): number { return typeof this.memberData.flags === "number" ? this.memberData.flags : 0; }
  get deaf(): boolean { return this.memberData.deaf === true; }
  get mute(): boolean { return this.memberData.mute === true; }
  get permissions(): string | null {
    return typeof this.memberData.permissions === "string" ? this.memberData.permissions : null;
  }
  get permissionBitField(): PermissionBitField {
    if (this.permissions === null) throw new Error("Member permissions are unavailable; fetch the member first.");
    return new PermissionBitField(BigInt(this.permissions));
  }
  get userFlags(): number { return this.user.publicFlags ?? 0; }

  /**
   * Checks whether this member has a permission through its guild roles.
   *
   * @param permission The bigint permission flag to test.
   * @returns `true` when the member's effective role permissions include it.
   * @throws If the member payload does not contain role information.
   */
  async hasPermission(permission: PermissionFlag): Promise<boolean> {
    const raw = this.memberData.permissions;
    if (typeof raw === "string") {
      return (BigInt(raw) & permission) === permission;
    }

    if (!Array.isArray(this.memberData.roles)) {
      throw new Error("Member roles are unavailable; fetch the guild member first.");
    }
    const roles = await this.client.request<Json[]>("GET", `/guilds/${this.guildId}/roles`);
    const memberRoleIds = new Set(
      this.memberData.roles.filter((role): role is string => typeof role === "string"),
    );
    memberRoleIds.add(this.guildId);
    const permissions = roles
      .filter((role) => memberRoleIds.has(String(role.id)))
      .reduce((bits, role) => {
        if (typeof role.permissions !== "string") {
          throw new Error(`Role ${String(role.id)} did not include a permissions bitfield.`);
        }
        return bits | BigInt(role.permissions);
      }, 0n);
    return (permissions & permission) === permission;
  }

  /** Checks whether this member has every requested permission. */
  async hasPermissions(...permissions: PermissionFlag[]): Promise<boolean> {
    if (permissions.length === 0) throw new Error("At least one permission is required.");
    const granted = await Promise.all(permissions.map((permission) => this.hasPermission(permission)));
    return granted.every(Boolean);
  }

  constructor(
    client: DiscordRestClient,
    private readonly guildId: string,
    id: string,
    data?: Json,
  ) {
    super(client, id, `/guilds/${guildId}/members/${id}`, data);
  }

  /** Fetches this member and returns a resource containing the latest payload. */
  override fetch(): Promise<DiscordMember> {
    return this.client.request<Json>("GET", this.route)
      .then((member) => new DiscordMember(this.client, this.guildId, this.id, member));
  }

  /** Adds a role to this member. */
  addRole(roleId: string): Promise<void> {
    return this.client.request<void>("PUT", `/guilds/${this.guildId}/members/${this.id}/roles/${roleId}`);
  }

  /** Removes a role from this member. */
  removeRole(roleId: string): Promise<void> {
    return this.client.request<void>("DELETE", `/guilds/${this.guildId}/members/${this.id}/roles/${roleId}`);
  }

  /** Replaces all roles assigned to this member. */
  setRoles(roleIds: string[]): Promise<DiscordMember> {
    if (roleIds.some((roleId) => !roleId)) throw new Error("Role IDs cannot be empty.");
    return this.client.request<Json>("PATCH", this.route, { roles: roleIds })
      .then((member) => new DiscordMember(this.client, this.guildId, this.id, member));
  }

  /** Removes the member from voice by clearing its voice channel. */
  disconnect(): Promise<DiscordMember> { return this.moveTo(null); }

  /**
   * Kicks this member from the guild.
   * @param reason Optional text written to Discord's audit log.
   * @returns A promise that resolves after Discord removes the member.
   */
  kick(reason?: string): Promise<void> {
    return this.client.request<void>("DELETE", this.route, undefined, reason ? { "X-Audit-Log-Reason": reason } : undefined);
  }

  /**
   * Bans this member from the guild.
   * @param options Controls recent-message deletion and the audit-log reason.
   * @returns A promise that resolves after Discord creates the ban.
   */
  ban(options: BanMemberOptions = {}): Promise<void> {
    return this.client.request<void>("PUT", `/guilds/${this.guildId}/bans/${this.id}`, {
      ...(options.deleteMessageSeconds === undefined ? {} : { delete_message_seconds: options.deleteMessageSeconds }),
    }, options.reason ? { "X-Audit-Log-Reason": options.reason } : undefined);
  }

  /**
   * Removes this user's guild ban.
   * @param reason Optional text written to Discord's audit log.
   * @returns A promise that resolves after Discord removes the ban.
   */
  unban(reason?: string): Promise<void> {
    return this.client.request<void>("DELETE", `/guilds/${this.guildId}/bans/${this.id}`, undefined, reason ? { "X-Audit-Log-Reason": reason } : undefined);
  }

  /**
   * Applies or removes a Discord communication timeout.
   * @param options The timeout end date, or `null` to clear the timeout.
   * @returns A refreshed member resource containing Discord's response.
   */
  timeout(options: TimeoutOptions): Promise<DiscordMember> {
    return this.client.request<Json>("PATCH", this.route, {
      communication_disabled_until: options.until?.toISOString() ?? null,
    }, options.reason ? { "X-Audit-Log-Reason": options.reason } : undefined)
      .then((member) => new DiscordMember(this.client, this.guildId, this.id, member));
  }

  /**
   * Sets the member's server nickname.
   * @param nickname The new nickname, or `null` to clear the current nickname.
   * @param reason Optional text written to Discord's audit log.
   * @returns A refreshed member resource containing Discord's response.
   */
  setNickname(nickname: string | null, reason?: string): Promise<DiscordMember> {
    return this.client.request<Json>("PATCH", this.route, { nick: nickname },
      reason ? { "X-Audit-Log-Reason": reason } : undefined)
      .then((member) => new DiscordMember(this.client, this.guildId, this.id, member));
  }

  /** Changes the member's server mute state. */
  setMute(mute: boolean): Promise<DiscordMember> {
    return this.edit({ mute });
  }

  /** Changes the member's server deafened state. */
  setDeaf(deaf: boolean): Promise<DiscordMember> {
    return this.edit({ deaf });
  }

  /** Moves the member to a voice channel, or disconnects them with null. */
  moveTo(channelId: string | null): Promise<DiscordMember> {
    return this.edit({ channel_id: channelId });
  }
}
