import type { Builder } from "./core.ts";
type Json = Record<string, unknown>;

/** Builds Discord poll payloads. */
export class PollBuilder implements Builder {
  private readonly data: Json = { answers: [] };
  setQuestion(text: string) { if (!text.trim()) throw new Error("A poll question is required."); this.data.question = { text }; return this; }
  addAnswer(text: string) {
    if (!text.trim()) throw new Error("A poll answer is required.");
    (this.data.answers as Json[]).push({ poll_media: { text } }); return this;
  }
  setDuration(hours: number) {
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) throw new Error("Poll duration must be 1-168 hours.");
    this.data.duration = hours; return this;
  }
  setAllowMultiselect(value = true) { this.data.allow_multiselect = value; return this; }
  toJSON() { return this.data; }
}
