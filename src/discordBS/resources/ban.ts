import type { Json } from "../types/common.ts";
import type { DiscordRestClient } from "../rest/client.ts";
import { DiscordUser } from "./user.ts";

export class DiscordBan {
  readonly id: string;
  readonly user: DiscordUser;
  private readonly reasonValue: string | null;
  constructor(client: DiscordRestClient, data: Json) {
    const user = data.user && typeof data.user === "object" ? data.user as Json : {};
    this.id = typeof user.id === "string" ? user.id : "";
    this.user = new DiscordUser(client, this.id, user);
    this.reasonValue = typeof data.reason === "string" ? data.reason : null;
  }
  get reason(): string | null { return this.reasonValue; }
  toJSON(): { id: string; user: ReturnType<DiscordUser["toJSON"]>; reason: string | null } {
    return { id: this.id, user: this.user.toJSON(), reason: this.reason };
  }
}
