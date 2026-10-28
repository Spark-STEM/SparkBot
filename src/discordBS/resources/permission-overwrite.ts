import { DiscordResource } from "./base.ts";
import type { DiscordRestClient } from "../rest/client.ts";
import type { Json } from "../types/common.ts";
import { OverwriteType, permissionBits, type PermissionFlag } from "../types/permissions.ts";

/** A channel permission overwrite for a role or guild member. */
export interface PermissionOverwriteOptions {
  /** Permission flags granted by this overwrite. */
  allow?: PermissionFlag[];
  /** Permission flags denied by this overwrite. */
  deny?: PermissionFlag[];
}

export class DiscordPermissionOverwrite<T extends OverwriteType = OverwriteType>
  extends DiscordResource<Json, DiscordPermissionOverwrite<T>> {
  readonly type: T;
  get allow(): string { return typeof this.data?.allow === "string" ? this.data.allow : "0"; }
  get deny(): string { return typeof this.data?.deny === "string" ? this.data.deny : "0"; }

  constructor(
    client: DiscordRestClient,
    private readonly channelId: string,
    id: string,
    type: T,
    data?: Json,
  ) {
    super(client, id, `/channels/${channelId}/permissions/${id}`, data);
    this.type = type;
  }

  /** Replaces this overwrite using permission flags. */
  setPermissions(options: PermissionOverwriteOptions = {}): Promise<DiscordPermissionOverwrite<T>> {
    return this.client.request<Json>("PUT", this.route, {
      id: this.id,
      type: this.type === OverwriteType.Role ? 0 : 1,
      allow: permissionBits(options.allow),
      deny: permissionBits(options.deny),
    }).then((data) => new DiscordPermissionOverwrite(
      this.client, this.channelId, this.id, this.type, data,
    ));
  }
}
