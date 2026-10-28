import type { Json } from "../types/common.ts";
import { DiscordUser } from "./user.ts";
import type { DiscordRestClient } from "../rest/client.ts";

export class DiscordThreadMember {
  readonly id: string;
  readonly user: DiscordUser;
  get joinTimestamp(): Date | null {
    return typeof this.data.join_timestamp === "string" ? new Date(this.data.join_timestamp) : null;
  }
  get flags(): number { return typeof this.data.flags === "number" ? this.data.flags : 0; }
  constructor(private readonly client: DiscordRestClient, private readonly data: Json) {
    this.id = typeof data.user_id === "string" ? data.user_id : "";
    this.user = new DiscordUser(client, this.id, data.user as Json | undefined);
  }
}
