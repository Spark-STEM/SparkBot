import type { APIApplicationCommandInteraction } from "discord-api-types/v10";
import type { Env } from "../../types.ts";
import { InteractionReply } from "./reply.ts";
import { CommandOptions } from "./options.ts";
import type { Json } from "../types/common.ts";

export class CommandInteraction extends InteractionReply {
  readonly options: CommandOptions;

  constructor(readonly raw: APIApplicationCommandInteraction, readonly env: Env) {
    const user = raw.member?.user ?? raw.user;
    super(env, raw.application_id, raw.token, raw.guild_id ?? null, user?.id ?? null, raw.member as unknown as Json);
    this.options = new CommandOptions(this.api, raw.guild_id ?? null, ("options" in raw.data ? raw.data.options ?? [] : []) as unknown as Json[]);
  }

  get commandName() { return this.raw.data.name; }
}
