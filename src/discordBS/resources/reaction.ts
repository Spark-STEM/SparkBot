import type { DiscordRestClient } from "../rest/client.ts";
import type { Json } from "../types/common.ts";
import { DiscordCollection } from "../types/collections.ts";
import { DiscordUser } from "./user.ts";

/** A reaction attached to a Discord message. */
export class DiscordMessageReaction {
  /** The reaction's emoji identifier (custom emoji ID or Unicode emoji). */
  readonly id: string;

  constructor(
    private readonly client: DiscordRestClient,
    readonly messageId: string,
    readonly channelId: string,
    readonly emoji: string,
    readonly count?: number,
    readonly me?: boolean,
  ) {
    this.id = emoji;
  }

  /** Removes the current bot user's reaction from the message. */
  remove(userId = "@me"): Promise<void> {
    if (!userId) throw new Error("A reaction user ID is required.");
    return this.client.request<void>(
      "DELETE",
      `/channels/${this.channelId}/messages/${this.messageId}/reactions/${encodeURIComponent(this.emoji)}/${userId}`,
    );
  }

  /** Fetches users who used this reaction. */
  users(options: { limit?: number; after?: string } = {}): Promise<DiscordCollection<DiscordUser>> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set("limit", String(options.limit));
    if (options.after) params.set("after", options.after);
    const suffix = params.size ? `?${params}` : "";
    return this.client.request<Json[]>(
      "GET",
      `/channels/${this.channelId}/messages/${this.messageId}/reactions/${encodeURIComponent(this.emoji)}${suffix}`,
    ).then((items) => new DiscordCollection(...items.map((item) =>
      new DiscordUser(this.client, String(item.id ?? ""), item))));
  }

  /** Lazily iterates through users who used this reaction. */
  async *userIterator(options: { pageSize?: number } = {}): AsyncGenerator<DiscordUser> {
    let after: string | undefined;
    const pageSize = Math.min(Math.max(options.pageSize ?? 100, 1), 100);
    while (true) {
      const page = await this.users({ limit: pageSize, after });
      for (const user of page) yield user;
      if (page.length < pageSize) return;
      const last = page[page.length - 1];
      if (!last || typeof last.id !== "string") return;
      after = last.id;
    }
  }
}
