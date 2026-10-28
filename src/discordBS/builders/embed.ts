import type { Builder } from "./core.ts";
import { assertValidEmbedPayload } from "../resources/embed-validation.ts";
type Json = Record<string, unknown>;

/** Builds Discord embed payloads. */
export class EmbedBuilder implements Builder {
  private readonly data: Json = {};
  private update(mutator: (data: Json) => void): this {
    const next = structuredClone(this.data);
    mutator(next);
    assertValidEmbedPayload(next);
    Object.keys(this.data).forEach((key) => delete this.data[key]);
    Object.assign(this.data, next);
    return this;
  }
  setTitle(title: string) { return this.update((data) => { data.title = title; }); }
  setDescription(description: string) { return this.update((data) => { data.description = description; }); }
  setColor(color: number | string) { return this.update((data) => { data.color = color; }); }
  setURL(url: string) { return this.update((data) => { data.url = url; }); }
  setTimestamp(timestamp = new Date()) { return this.update((data) => { data.timestamp = timestamp.toISOString(); }); }
  setAuthor(author: Json) { return this.update((data) => { data.author = author; }); }
  setFooter(footer: Json) { return this.update((data) => { data.footer = footer; }); }
  setThumbnail(url: string) { return this.update((data) => { data.thumbnail = { url }; }); }
  setImage(url: string) { return this.update((data) => { data.image = { url }; }); }
  setFields(...fields: Json[]) { return this.update((data) => { data.fields = fields; }); }
  addFields(...fields: Json[]) {
    return this.update((data) => { data.fields = [...(data.fields as Json[] ?? []), ...fields]; });
  }
  clearFields() { return this.update((data) => { delete data.fields; }); }
  toJSON() {
    assertValidEmbedPayload(this.data);
    return structuredClone(this.data);
  }
}
