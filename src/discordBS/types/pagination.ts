export interface PaginationOptions {
  signal?: AbortSignal;
  maxItems?: number;
}

export class DiscordPaginator<T> implements AsyncIterable<T> {
  constructor(
    private readonly loadPage: (cursor: string | undefined, signal?: AbortSignal) =>
      Promise<{ items: readonly T[]; nextCursor?: string }>,
    private readonly options: PaginationOptions = {},
  ) {}
  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    let cursor: string | undefined;
    let yielded = 0;
    while (this.options.maxItems === undefined || yielded < this.options.maxItems) {
      if (this.options.signal?.aborted) throw new DOMException("Pagination aborted.", "AbortError");
      const page = await this.loadPage(cursor, this.options.signal);
      for (const item of page.items) {
        if (this.options.maxItems !== undefined && yielded >= this.options.maxItems) return;
        yield item;
        yielded++;
      }
      if (!page.nextCursor || page.items.length === 0) return;
      cursor = page.nextCursor;
    }
  }
}
