import type { Json } from "../types/common.ts";

export class DiscordInviteGuild {
  constructor(private readonly data: Json) {}
  get id(): string { return typeof this.data.id === "string" ? this.data.id : ""; }
  get name(): string | null { return typeof this.data.name === "string" ? this.data.name : null; }
  get icon(): string | null { return typeof this.data.icon === "string" ? this.data.icon : null; }
  toJSON(): Json { return structuredClone(this.data); }
}

export class DiscordInviteChannel {
  constructor(private readonly data: Json) {}
  get id(): string { return typeof this.data.id === "string" ? this.data.id : ""; }
  get name(): string | null { return typeof this.data.name === "string" ? this.data.name : null; }
  get type(): number | null { return typeof this.data.type === "number" ? this.data.type : null; }
  toJSON(): Json { return structuredClone(this.data); }
}
