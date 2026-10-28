/** Validates a Discord snowflake-shaped identifier. */
export function assertSnowflake(value: string, label = "ID"): void {
  if (!/^\d{15,21}$/.test(value)) throw new Error(`${label} must be a Discord snowflake.`);
}

/** Validates Discord message content limits. */
export function assertMessageContent(content: string): void {
  if (content.length > 2000) throw new Error("Message content cannot exceed 2000 characters.");
}

/** Validates an attachment descriptor before multipart construction. */
export function assertFileUpload(file: { name: string; data: Blob | ArrayBuffer | string }): void {
  if (!file.name.trim()) throw new Error("Uploaded files require a name.");
  if (file.data instanceof Blob && file.data.size > 25 * 1024 * 1024) {
    throw new Error("Uploaded files cannot exceed 25 MiB.");
  }
}

export function assertPaginationLimit(value: number | undefined, max: number, label = "limit"): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > max)) {
    throw new Error(`${label} must be an integer between 1 and ${max}.`);
  }
}

export function assertChannelName(value: string): void {
  if (!value.trim() || value.length > 100) throw new Error("Channel names must be between 1 and 100 characters.");
}

export function assertRoleName(value: string): void {
  if (!value.trim() || value.length > 100) throw new Error("Role names must be between 1 and 100 characters.");
}

export function assertNickname(value: string): void {
  if (value.length > 32) throw new Error("Nicknames cannot exceed 32 characters.");
}
