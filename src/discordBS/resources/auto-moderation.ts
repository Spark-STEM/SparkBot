import { DiscordResource } from "./base.ts";
import type { DiscordRestClient } from "../rest/client.ts";
import type { Json } from "../types/common.ts";

export class DiscordAutoModerationRule extends DiscordResource<Json, DiscordAutoModerationRule> {
  get name(): string | null { return typeof this.data?.name === "string" ? this.data.name : null; }
  get eventType(): number | null { return typeof this.data?.event_type === "number" ? this.data.event_type : null; }
  get triggerType(): number | null { return typeof this.data?.trigger_type === "number" ? this.data.trigger_type : null; }
  get enabled(): boolean { return this.data?.enabled === true; }
  get exemptRoles(): string[] { return this.strings("exempt_roles"); }
  get exemptChannels(): string[] { return this.strings("exempt_channels"); }
  private strings(key: string): string[] {
    return Array.isArray(this.data?.[key]) ? (this.data[key] as unknown[]).filter((value): value is string => typeof value === "string") : [];
  }
  constructor(client: DiscordRestClient, guildId: string, id: string, data?: Json) {
    super(client, id, `/guilds/${guildId}/auto-moderation/rules/${id}`, data);
  }
  override fetch(): Promise<DiscordAutoModerationRule> {
    return this.client.request<Json>("GET", this.route)
      .then((rule) => new DiscordAutoModerationRule(this.client, this.route.split("/")[2] ?? "", this.id, rule));
  }
  override edit(payload: Json): Promise<DiscordAutoModerationRule> {
    return this.client.request<Json>("PATCH", this.route, payload)
      .then((rule) => new DiscordAutoModerationRule(this.client, this.route.split("/")[2] ?? "", this.id, rule));
  }
}
