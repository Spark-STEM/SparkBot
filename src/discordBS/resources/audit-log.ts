import { DiscordResource } from "./base.ts";
import type { DiscordRestClient } from "../rest/client.ts";
import type { Json } from "../types/common.ts";
import { DiscordUser } from "./user.ts";

export class DiscordAuditLogChange {
  constructor(private readonly data: Json) {}
  get key(): string { return typeof this.data.key === "string" ? this.data.key : ""; }
  get oldValue(): unknown { return this.data.old_value; }
  get newValue(): unknown { return this.data.new_value; }
}

export class DiscordAuditLogEntry extends DiscordResource<Json, DiscordAuditLogEntry> {
  get actionType(): number | null { return typeof this.raw?.action_type === "number" ? this.raw.action_type : null; }
  get userId(): string | null { return typeof this.raw?.user_id === "string" ? this.raw.user_id : null; }
  get targetId(): string | null { return typeof this.raw?.target_id === "string" ? this.raw.target_id : null; }
  get reason(): string | null { return typeof this.raw?.reason === "string" ? this.raw.reason : null; }
  get changes(): DiscordAuditLogChange[] {
    return Array.isArray(this.raw?.changes)
      ? this.raw.changes.filter((change): change is Json => Boolean(change && typeof change === "object"))
        .map((change) => new DiscordAuditLogChange(change))
      : [];
  }
  get executor(): DiscordUser | null {
    return this.userId ? new DiscordUser(this.client, this.userId) : null;
  }
  fetchExecutor(): Promise<DiscordUser> {
    if (!this.userId) throw new Error("This audit-log entry has no executor ID.");
    return this.client.request<Json>("GET", `/users/${this.userId}`)
      .then((user) => new DiscordUser(this.client, this.userId!, user));
  }
  fetchTarget<T>(factory: (client: DiscordRestClient, id: string) => { fetch(): Promise<T> }): Promise<T> {
    if (!this.targetId) throw new Error("This audit-log entry has no target ID.");
    return factory(this.client, this.targetId).fetch();
  }
  constructor(client: DiscordRestClient, guildId: string, id: string, data?: Json) {
    super(client, id, `/guilds/${guildId}/audit-logs`, data);
  }
}
