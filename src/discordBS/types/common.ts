/** JSON object used for Discord payloads whose exact shape varies by endpoint. */
export type Json = Record<string, unknown>;
export interface FileUpload {
  /** File name Discord should use for the upload. */
  name: string;
  /** File contents accepted by the Worker runtime. */
  data: Blob | ArrayBuffer | string;
  description?: string;
  spoiler?: boolean;
}
export type RequestBody = Json | string | ArrayBuffer | FormData;
export type MessagePayload = Json & { files?: FileUpload[] };

/** Channel types supported by guild channel creation. */
export enum ChannelType {
  Text = "text",
  Voice = "voice",
  Category = "category",
  Announcement = "announcement",
  Forum = "forum",
  Stage = "stage",
}

/** Target types accepted by a channel permission overwrite. */
export enum OverwriteType {
  Member = "Member",
  Role = "Role",
}
