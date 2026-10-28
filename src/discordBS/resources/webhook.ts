import { DiscordResource } from "./base.ts";
import { DiscordMessage } from "./message.ts";
import type { DiscordRestClient } from "../rest/client.ts";
import type { Json, MessagePayload } from "../types/common.ts";

/** A Discord webhook resource. */
export class DiscordWebhook extends DiscordResource<Json, DiscordWebhook> {
  get name(): string | null { return typeof this.data?.name === "string" ? this.data.name : null; }
  get token(): string | null { return typeof this.data?.token === "string" ? this.data.token : null; }
  get type(): number | null { return typeof this.data?.type === "number" ? this.data.type : null; }
  get applicationId(): string | null { return typeof this.data?.application_id === "string" ? this.data.application_id : null; }
  get guildId(): string | null { return typeof this.data?.guild_id === "string" ? this.data.guild_id : null; }
  get channelId(): string | null { return typeof this.data?.channel_id === "string" ? this.data.channel_id : null; }

  constructor(
    client: DiscordRestClient,
    id: string,
    private readonly webhookRoute: string,
    data?: Json,
  ) {
    super(client, id, webhookRoute, data);
  }

  override fetch(): Promise<DiscordWebhook> {
    return this.client.request<Json>("GET", this.webhookRoute)
      .then((webhook) => new DiscordWebhook(this.client, this.id, this.webhookRoute, webhook));
  }

  override edit(payload: Json): Promise<DiscordWebhook> {
    return this.client.request<Json>("PATCH", this.webhookRoute, payload)
      .then((webhook) => new DiscordWebhook(this.client, this.id, this.webhookRoute, webhook));
  }

  /** Executes this webhook and optionally waits for the created message. */
  execute(options: { payload: MessagePayload; wait?: boolean; threadId?: string; threadName?: string }) {
    const { payload, wait = true, threadId, threadName } = options;
    const query = new URLSearchParams();
    if (wait) query.set("wait", "true");
    if (threadId) query.set("thread_id", threadId);
    if (threadName) query.set("thread_name", threadName);
    const suffix = query.size ? `?${query}` : "";
    const files = payload.files ?? [];
    const request = files.length > 0
      ? this.client.requestMultipart<Json>("POST", `${this.webhookRoute}/${this.token ?? ""}${suffix}`, payload, files)
      : this.client.request<Json>("POST", `${this.webhookRoute}/${this.token ?? ""}${suffix}`, payload);
    return request
      .then((message) => message && new DiscordMessage(
        this.client,
        String(message.id),
        `${this.webhookRoute}/${this.token ?? ""}/messages/${message.id}`,
        message,
      ));
  }

  /** Fetches a message previously sent by this webhook. */
  fetchMessage(messageId: string): Promise<DiscordMessage> {
    if (!messageId) throw new Error("A webhook message ID is required.");
    return this.client.request<Json>("GET", `${this.webhookRoute}/${this.token ?? ""}/messages/${messageId}`)
      .then((message) => new DiscordMessage(
        this.client,
        messageId,
        `${this.webhookRoute}/${this.token ?? ""}/messages/${messageId}`,
        message,
      ));
  }

  /** Edits a message previously sent by this webhook. */
  editMessage(messageId: string, payload: Json): Promise<DiscordMessage> {
    if (!messageId) throw new Error("A webhook message ID is required.");
    return this.client.request<Json>(
      "PATCH", `${this.webhookRoute}/${this.token ?? ""}/messages/${messageId}`, payload,
    ).then((message) => new DiscordMessage(
      this.client,
      messageId,
      `${this.webhookRoute}/${this.token ?? ""}/messages/${messageId}`,
      message,
    ));
  }

  /** Deletes a message previously sent by this webhook. */
  deleteMessage(messageId: string): Promise<void> {
    if (!messageId) throw new Error("A webhook message ID is required.");
    return this.client.request<void>(
      "DELETE", `${this.webhookRoute}/${this.token ?? ""}/messages/${messageId}`,
    );
  }
}
