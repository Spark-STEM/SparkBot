import { DiscordResource } from "./base.ts";
import type { DiscordRestClient } from "../rest/client.ts";
import type { Json } from "../types/common.ts";
import { PermissionBitField, permissionBits, type PermissionFlag } from "../types/permissions.ts";
import { DiscordCollection } from "../types/collections.ts";

export interface RoleTags {
  botId?: string;
  integrationId?: string;
  subscriptionListingId?: string;
  premiumSubscriber?: null;
  availableForPurchase?: null;
  guildConnections?: null;
}

/** A Discord role resource with member and permission management. */
export class DiscordRole extends DiscordResource<Json, DiscordRole> {
  /** The role's display name, when this resource has been fetched. */
  get name(): string | null { return typeof this.data?.name === "string" ? this.data.name : null; }
  /** The role's color integer, or null when unavailable. */
  get color(): number | null { return typeof this.data?.color === "number" ? this.data.color : null; }
  /** Whether Discord marks this role as hoisted in the member list. */
  get hoist(): boolean { return this.data?.hoist === true; }
  get position(): number | null { return typeof this.data?.position === "number" ? this.data.position : null; }
  get managed(): boolean { return this.data?.managed === true; }
  get mentionable(): boolean { return this.data?.mentionable === true; }
  get permissions(): string | null { return typeof this.data?.permissions === "string" ? this.data.permissions : null; }
  get permissionBitField(): PermissionBitField {
    if (this.permissions === null) throw new Error("Role permissions are unavailable; fetch the role first.");
    return new PermissionBitField(BigInt(this.permissions));
  }
  get icon(): string | null { return typeof this.data?.icon === "string" ? this.data.icon : null; }
  get unicodeEmoji(): string | null { return typeof this.data?.unicode_emoji === "string" ? this.data.unicode_emoji : null; }
  get tags(): RoleTags | null {
    if (!this.data?.tags || typeof this.data.tags !== "object") return null;
    const tags = this.data.tags as Json;
    return {
      ...(typeof tags.bot_id === "string" ? { botId: tags.bot_id } : {}),
      ...(typeof tags.integration_id === "string" ? { integrationId: tags.integration_id } : {}),
      ...(typeof tags.subscription_listing_id === "string" ? { subscriptionListingId: tags.subscription_listing_id } : {}),
      ...(tags.premium_subscriber === null ? { premiumSubscriber: null } : {}),
      ...(tags.available_for_purchase === null ? { availableForPurchase: null } : {}),
      ...(tags.guild_connections === null ? { guildConnections: null } : {}),
    };
  }

  /**
   * Checks whether this role grants a permission flag.
   *
   * @param permission The bigint permission flag to test.
   * @returns `true` when the role's permission bitfield includes the flag.
   * @throws If this role was not fetched with a permissions bitfield.
   */
  hasPermission(permission: PermissionFlag): boolean {
    if (this.permissions === null) {
      throw new Error("Role permissions are unavailable; fetch the role first.");
    }
    return (BigInt(this.permissions) & permission) === permission;
  }

  /** Checks whether this role grants every supplied permission flag. */
  hasPermissions(...permissions: PermissionFlag[]): boolean {
    if (permissions.length === 0) throw new Error("At least one permission is required.");
    return permissions.every((permission) => this.hasPermission(permission));
  }

  constructor(
    client: DiscordRestClient,
    private readonly guildId: string,
    id: string,
    data?: Json,
  ) {
    super(client, id, `/guilds/${guildId}/roles/${id}`, data);
  }

  /** Fetches this role and returns a resource containing its latest payload. */
  override fetch(): Promise<DiscordRole> {
    return this.client.request<Json>("GET", this.route)
      .then((role) => new DiscordRole(this.client, this.guildId, this.id, role));
  }

  /** Edits this role and returns the updated role resource. */
  override edit(payload: Json): Promise<DiscordRole> {
    return this.client.request<Json>("PATCH", this.route, payload)
      .then((role) => new DiscordRole(this.client, this.guildId, this.id, role));
  }

  /** Moves this role to a new guild hierarchy position. */
  setPosition(position: number): Promise<DiscordCollection<DiscordRole>> {
    if (!Number.isInteger(position) || position < 0) throw new Error("Role position must be a non-negative integer.");
    return this.client.request<Json[]>("PATCH", `/guilds/${this.guildId}/roles`, {
      id: this.id,
      position,
    }).then((roles) => new DiscordCollection<DiscordRole>(...roles.map((role) =>
      new DiscordRole(this.client, this.guildId, String(role.id), role))));
  }

  /** Adds this role to each listed guild member. */
  addMembers(memberIds: string[]): Promise<void[]> {
    return Promise.all(memberIds.map((memberId) =>
      this.client.request<void>("PUT", `/guilds/${this.guildId}/members/${memberId}/roles/${this.id}`)));
  }

  /** Removes this role from each listed guild member. */
  removeMembers(memberIds: string[]): Promise<void[]> {
    return Promise.all(memberIds.map((memberId) =>
      this.client.request<void>("DELETE", `/guilds/${this.guildId}/members/${memberId}/roles/${this.id}`)));
  }

  /** Replaces this role's permissions using bigint permission flags. */
  editPermissions(permissions: PermissionFlag[]): Promise<DiscordRole> {
    return this.edit({ permissions: permissionBits(permissions) });
  }
}
