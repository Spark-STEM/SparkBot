import type { APIModalSubmitInteraction } from "discord-api-types/v10";
import type { Env } from "../../types.ts";
import { InteractionReply } from "./reply.ts";
import type { Json } from "../types/common.ts";
import { DiscordCollection } from "../types/collections.ts";

export interface ModalField { id: string; value: string; }

export class ModalFieldCollection extends DiscordCollection<ModalField> {
  getTextInputValue(id: string): string {
    return this.get(id)?.value ?? "";
  }
}

export class ModalInteraction extends InteractionReply {

  constructor(readonly raw: APIModalSubmitInteraction, readonly env: Env) {
    const user = raw.member?.user ?? raw.user;
    super(env, raw.application_id, raw.token, raw.guild_id ?? null, user?.id ?? null, raw.member as unknown as Json);
  }

  get customId() { return this.raw.data.custom_id; }
  get fields(): ModalFieldCollection {
    const values = new Map<string, string>();
    const visit = (component: Json) => {
      if (typeof component.custom_id === "string" && typeof component.value === "string") {
        values.set(component.custom_id, component.value);
      }
      for (const child of (component.components as Json[] | undefined) ?? []) visit(child);
      if (component.component && typeof component.component === "object") visit(component.component as Json);
    };
    for (const component of this.raw.data.components) visit(component as unknown as Json);
    const result = new ModalFieldCollection();
    result.push(...Array.from(values, ([id, value]) => ({ id, value })));
    return result;
  }
}
