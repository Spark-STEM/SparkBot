import type { DiscordRestClient } from "../rest/client.ts";
import type { Json } from "../types/common.ts";

/** Base reference for a Discord REST resource. */
export class DiscordResource<T extends Json = Json, Response = T> {
  constructor(
    protected readonly client: DiscordRestClient,
    readonly id: string,
    protected readonly route: string,
    protected data?: T,
  ) { this.updatedAt = data === undefined ? null : new Date(); }

  private updatedAt: Date | null;

  /** Returns the most recently received Discord payload, when available. */
  get raw(): T | undefined { return this.data; }
  get isFetched(): boolean { return this.data !== undefined; }
  get fetchedAt(): Date | null { return this.updatedAt; }
  /** Marks this lazy reference as not fetched without making a network request. */
  invalidate(): void { this.data = undefined; this.updatedAt = null; }
  /** Fetches the resource again; equivalent to `fetch()` for resource APIs. */
  refresh(): Promise<Response> { return this.fetch(); }

  /** Serializes this resource without exposing its REST client or route internals. */
  toJSON(): { id: string; resource: string; data?: T } {
    return {
      id: this.id,
      resource: this.constructor.name,
      ...(this.data === undefined ? {} : { data: this.data }),
    };
  }

  /** Fetches the latest representation of this resource from Discord. */
  fetch(): Promise<Response> {
    return this.client.request<Response>("GET", this.route);
  }

  /** Applies a partial update and returns Discord's updated representation. */
  edit(payload: Json): Promise<Response> {
    return this.client.request<Response>("PATCH", this.route, payload);
  }

  /** Deletes this resource. */
  delete(): Promise<void> {
    return this.client.request<void>("DELETE", this.route);
  }
}
