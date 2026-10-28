import type { Json } from "../types/common.ts";

const textLength = (value: unknown): number => typeof value === "string" ? value.length : 0;

export function assertValidEmbedPayload(payload: Json): void {
  const fields = Array.isArray(payload.fields) ? payload.fields.filter((field): field is Json =>
    Boolean(field && typeof field === "object")) : [];
  const titleLength = textLength(payload.title);
  const descriptionLength = textLength(payload.description);
  const footer = payload.footer && typeof payload.footer === "object" ? payload.footer as Json : undefined;
  const author = payload.author && typeof payload.author === "object" ? payload.author as Json : undefined;
  const errors: string[] = [];

  if (titleLength > 256) errors.push("Embed title cannot exceed 256 characters.");
  if (descriptionLength > 4096) errors.push("Embed description cannot exceed 4096 characters.");
  if (fields.length > 25) errors.push("An embed cannot contain more than 25 fields.");
  if (fields.some((field) => textLength(field.name) > 256 || textLength(field.value) > 1024)) {
    errors.push("Embed field names cannot exceed 256 characters and values cannot exceed 1024 characters.");
  }

  const total = titleLength + descriptionLength + textLength(footer?.text) + textLength(author?.name) +
    fields.reduce((sum, field) => sum + textLength(field.name) + textLength(field.value), 0);
  if (total > 6000) errors.push("The combined text in an embed cannot exceed 6000 characters.");
  if (errors.length > 0) throw new Error(errors.join(" "));
}
