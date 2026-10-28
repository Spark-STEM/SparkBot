import { DiscordResource } from "./base.ts";
import type { DiscordRestClient } from "../rest/client.ts";
import type { Json } from "../types/common.ts";
import { DiscordRoutes } from "../rest/routes.ts";
import { DiscordDMChannel } from "./dm-channel.ts";

/** A Discord user resource with common identity and avatar fields. */
export class DiscordUser extends DiscordResource<Json, DiscordUser> {
  /** The user's username, or null until the user payload is available. */
  get name(): string | null { return this.username; }
  /** The user's Discord username, when this resource has been fetched. */
  get username(): string | null { return typeof this.data?.username === "string" ? this.data.username : null; }
  /** The user's global display name, when supplied by Discord. */
  get globalName(): string | null {
    return typeof this.data?.global_name === "string" ? this.data.global_name : null;
  }
  /** Whether this account is a bot user. */
  get bot(): boolean { return this.data?.bot === true; }
  get system(): boolean { return this.data?.system === true; }
  get publicFlags(): number | null { return typeof this.data?.public_flags === "number" ? this.data.public_flags : null; }
  get accentColor(): number | null { return typeof this.data?.accent_color === "number" ? this.data.accent_color : null; }
  /** The user's avatar hash, when the user has a custom avatar. */
  private get avatar(): string | null { return typeof this.data?.avatar === "string" ? this.data.avatar : null; }
  /** Returns the CDN URL for the user's avatar, or null when no avatar is set. */
  get avatarURL(): string | null {
    return this.avatar ? `https://cdn.discordapp.com/avatars/${this.id}/${this.avatar}.png?size=4096` : null;
  }

  /** Finds an existing direct-message channel with this user, if one exists. */
  fetchDMChannel(): Promise<DiscordDMChannel | null> {
    return this.client.request<Json[]>("GET", DiscordRoutes.userDM())
      .then((channels) => {
        const channel = channels.find((item) => {
          const recipients = Array.isArray(item.recipients) ? item.recipients : [];
          return recipients.some((recipient) =>
            recipient && typeof recipient === "object" && String((recipient as Json).id ?? "") === this.id);
        });
        return channel && typeof channel.id === "string"
          ? new DiscordDMChannel(this.client, this.id, channel)
          : null;
      });
  }

  /** Returns a DM channel resource; sending through it opens the channel if needed. */
  getDMChannel(): DiscordDMChannel {
    return new DiscordDMChannel(this.client, this.id);
  }

  constructor(client: DiscordRestClient, id: string, data?: Json) {
    super(client, id, `/users/${id}`, data);
  }

  /** Fetches the latest global user representation. */
  override fetch(): Promise<DiscordUser> {
    return this.client.request<Json>("GET", this.route)
      .then((user) => new DiscordUser(this.client, this.id, user));
  }
}
