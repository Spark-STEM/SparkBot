import { DiscordResource } from "./base.ts";
import type { DiscordRestClient } from "../rest/client.ts";
import type { Json } from "../types/common.ts";

/** A Discord user resource with common identity and avatar fields. */
export class DiscordUser extends DiscordResource {
  /** The user's Discord username, when this resource has been fetched. */
  get username(): string | null { return typeof this.data?.username === "string" ? this.data.username : null; }
  /** The user's global display name, when supplied by Discord. */
  get globalName(): string | null {
    return typeof this.data?.global_name === "string" ? this.data.global_name : null;
  }
  /** Whether this account is a bot user. */
  get bot(): boolean { return this.data?.bot === true; }
  get discriminator(): string | null { return typeof this.data?.discriminator === "string" ? this.data.discriminator : null; }
  get system(): boolean { return this.data?.system === true; }
  get publicFlags(): number | null { return typeof this.data?.public_flags === "number" ? this.data.public_flags : null; }
  get accentColor(): number | null { return typeof this.data?.accent_color === "number" ? this.data.accent_color : null; }
  /** The user's avatar hash, when the user has a custom avatar. */
  private get avatar(): string | null { return typeof this.data?.avatar === "string" ? this.data.avatar : null; }
  /** Returns the CDN URL for the user's avatar, or null when no avatar is set. */
  get avatarURL(): string | null {
    return this.avatar ? `https://cdn.discordapp.com/avatars/${this.id}/${this.avatar}.png?size=4096` : null;
  }

  constructor(client: DiscordRestClient, id: string, data?: Json) {
    super(client, id, `/users/${id}`, data);
  }
}
