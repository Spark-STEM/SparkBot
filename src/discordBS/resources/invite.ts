import { DiscordResource } from "./base.ts";
import type { DiscordRestClient } from "../rest/client.ts";
import type { Json } from "../types/common.ts";
import { DiscordInviteChannel, DiscordInviteGuild } from "./invite-details.ts";
import { DiscordUser } from "./user.ts";

/** A Discord invite resource. */
export class DiscordInvite extends DiscordResource<Json, DiscordInvite> {
  get code(): string { return this.id; }
  get url(): string { return `https://discord.gg/${this.id}`; }
  get maxAge(): number { return typeof this.data?.max_age === "number" ? this.data.max_age : 0; }
  get maxUses(): number { return typeof this.data?.max_uses === "number" ? this.data.max_uses : 0; }
  get temporary(): boolean { return this.data?.temporary === true; }
  get uses(): number { return typeof this.data?.uses === "number" ? this.data.uses : 0; }
  get createdAt(): Date | null { return typeof this.data?.created_at === "string" ? new Date(this.data.created_at) : null; }
  get expiresAt(): Date | null { return typeof this.data?.expires_at === "string" ? new Date(this.data.expires_at) : null; }
  get guild(): DiscordInviteGuild | null {
    return this.data?.guild && typeof this.data.guild === "object" ? new DiscordInviteGuild(this.data.guild as Json) : null;
  }
  get channel(): DiscordInviteChannel | null {
    return this.data?.channel && typeof this.data.channel === "object" ? new DiscordInviteChannel(this.data.channel as Json) : null;
  }
  get inviter(): DiscordUser | null {
    return this.data?.inviter && typeof this.data.inviter === "object"
      ? new DiscordUser(this.client, String((this.data.inviter as Json).id ?? ""), this.data.inviter as Json) : null;
  }

  constructor(client: DiscordRestClient, code: string, data?: Json) {
    super(client, code, `/invites/${code}`, data);
  }

  override fetch(): Promise<DiscordInvite> {
    return this.client.request<Json>("GET", this.route)
      .then((invite) => new DiscordInvite(this.client, this.id, invite));
  }
}
