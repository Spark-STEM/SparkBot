import { DiscordResource } from "./base.ts";
import type { DiscordRestClient } from "../rest/client.ts";
import type { Json } from "../types/common.ts";

export interface ScheduledEventOptions {
  name: string;
  scheduledStartTime: string;
  entityType: number;
  privacyLevel?: number;
  scheduledEndTime?: string;
  description?: string;
  channelId?: string | null;
  entityMetadata?: Record<string, string>;
}

export class DiscordScheduledEvent extends DiscordResource<Json, DiscordScheduledEvent> {
  get name(): string | null { return typeof this.data?.name === "string" ? this.data.name : null; }
  get description(): string | null { return typeof this.data?.description === "string" ? this.data.description : null; }
  get scheduledStartTime(): Date | null { return this.date("scheduled_start_time"); }
  get scheduledEndTime(): Date | null { return this.date("scheduled_end_time"); }
  get entityType(): number | null { return typeof this.data?.entity_type === "number" ? this.data.entity_type : null; }
  get status(): number | null { return typeof this.data?.status === "number" ? this.data.status : null; }
  get channelId(): string | null { return typeof this.data?.channel_id === "string" ? this.data.channel_id : null; }
  private date(key: string): Date | null {
    return typeof this.data?.[key] === "string" ? new Date(this.data[key] as string) : null;
  }
  constructor(client: DiscordRestClient, guildId: string, id: string, data?: Json) {
    super(client, id, `/guilds/${guildId}/scheduled-events/${id}`, data);
  }
  override fetch(): Promise<DiscordScheduledEvent> {
    return this.client.request<Json>("GET", this.route)
      .then((event) => new DiscordScheduledEvent(this.client, this.route.split("/")[2] ?? "", this.id, event));
  }
  override edit(payload: Json): Promise<DiscordScheduledEvent> {
    return this.client.request<Json>("PATCH", this.route, payload)
      .then((event) => new DiscordScheduledEvent(this.client, this.route.split("/")[2] ?? "", this.id, event));
  }
}
