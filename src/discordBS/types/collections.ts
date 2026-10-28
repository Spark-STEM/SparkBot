/** A small Discord.js-like keyed collection backed by an array. */
export class DiscordCollection<T extends { id: string }> extends Array<T> {
  /** Returns the item with this ID, when present. */
  get(id: string): T | undefined { return this.find((item) => item.id === id); }
  /** Returns whether this collection contains an ID. */
  has(id: string): boolean { return this.some((item) => item.id === id); }
  /** Returns the first item, if any. */
  first(): T | undefined { return this[0]; }
  /** Returns the last item, if any. */
  last(): T | undefined { return this[this.length - 1]; }
  /** Returns the first item matching a predicate. */
  findItem(predicate: (item: T, index: number) => boolean): T | undefined {
    return this.find(predicate);
  }
  /** Returns a new keyed collection containing matching items. */
  filterItems(predicate: (item: T, index: number) => boolean): DiscordCollection<T> {
    const result = new DiscordCollection<T>();
    result.push(...this.filter(predicate));
    return result;
  }
  /** Returns a mapped array. */
  mapItems<U>(mapper: (item: T, index: number) => U): U[] { return this.map(mapper); }
  /** Returns a JSON-safe array copy. */
  toJSON(): T[] { return Array.from(this); }
  /** Splits this collection into matching and non-matching items. */
  partition(predicate: (item: T, index: number) => boolean): [DiscordCollection<T>, DiscordCollection<T>] {
    const matching = new DiscordCollection<T>();
    const rest = new DiscordCollection<T>();
    this.forEach((item, index) => (predicate(item, index) ? matching : rest).push(item));
    return [matching, rest];
  }
  /** Returns a shallow independent copy of this collection. */
  clone(): DiscordCollection<T> {
    const result = new DiscordCollection<T>();
    result.push(...this);
    return result;
  }
  /** Converts this collection into a native map keyed by resource ID. */
  toMap(): Map<string, T> { return new Map(this.map((item) => [item.id, item])); }
  /** Returns the item at an index. */
  override at(index: number): T | undefined { return index < 0 ? this[this.length + index] : this[index]; }
  /** Sorts a copied collection by a selector. */
  sortBy<K>(selector: (item: T) => K): DiscordCollection<T> {
    return this.clone().sort((left, right) => selector(left) < selector(right) ? -1 : selector(left) > selector(right) ? 1 : 0);
  }
  /** Groups a collection by a selector. */
  groupBy<K>(selector: (item: T) => K): Map<K, DiscordCollection<T>> {
    const groups = new Map<K, DiscordCollection<T>>();
    this.forEach((item) => {
      const key = selector(item);
      const group = groups.get(key) ?? new DiscordCollection<T>();
      group.push(item);
      groups.set(key, group);
    });
    return groups;
  }
  /** Compares IDs and order with another collection. */
  equals(other: readonly T[]): boolean {
    return this.length === other.length && this.every((item, index) => item.id === other[index]?.id);
  }
}
