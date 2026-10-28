import type { APIMessageComponentInteraction } from "discord-api-types/v10";
import type { Env } from "../../types.ts";
import { InteractionReply } from "./reply.ts";
import { DiscordCollection } from "../types/collections.ts";
import type { Json } from "../types/common.ts";

export interface SelectedComponentValue { id: string; value: string; }

export class ComponentInteraction extends InteractionReply {
  constructor(readonly raw: APIMessageComponentInteraction, readonly env: Env) {
    const user = raw.member?.user ?? raw.user;
    super(env, raw.application_id, raw.token, raw.guild_id ?? null, user?.id ?? null, raw.member as unknown as Json);
  }

  get customId() { return this.raw.data.custom_id; }
  get values(): DiscordCollection<SelectedComponentValue> {
    const values = "values" in this.raw.data ? this.raw.data.values : [];
    return new DiscordCollection(...values.map((value) => ({ id: value, value })));
  }
  get isButton(): boolean { return this.raw.data.component_type === 2; }
  get isStringSelect(): boolean { return this.raw.data.component_type === 3; }
  get isUserSelect(): boolean { return this.raw.data.component_type === 5; }
  get isRoleSelect(): boolean { return this.raw.data.component_type === 6; }
  get isMentionableSelect(): boolean { return this.raw.data.component_type === 7; }
  get isChannelSelect(): boolean { return this.raw.data.component_type === 8; }
}
