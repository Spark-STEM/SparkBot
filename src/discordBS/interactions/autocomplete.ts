import { InteractionResponseType, type APIApplicationCommandAutocompleteInteraction, type APIInteractionResponse } from "discord-api-types/v10";
import type { Env } from "../../types.ts";
import { InteractionContext } from "./core.ts";

export class AutocompleteInteraction extends InteractionContext {
  response?: APIInteractionResponse;
  constructor(readonly raw: APIApplicationCommandAutocompleteInteraction, readonly env: Env) {
    const user = raw.member?.user ?? raw.user;
    super(env, raw.guild_id ?? null, user?.id ?? null, raw.member as Record<string, unknown> | undefined);
  }

  get options() {
    const focused = this.raw.data.options.find((option) => "focused" in option && option.focused) as
      | { name: string; value?: string }
      | undefined;
    const name = focused?.name ?? "";
    const value = focused?.value ?? "";
    return { getFocused: <T extends boolean>(full?: T) => full ? { name, value } : value };
  }

  async respond(choices: { name: string; value: string }[]): Promise<void> {
    if (this.response) throw new Error("This autocomplete interaction has already been acknowledged.");
    if (choices.length > 25) throw new Error("Discord allows at most 25 autocomplete choices.");
    if (choices.some((choice) => !choice.name || !choice.value)) {
      throw new Error("Autocomplete choices must contain non-empty name and value fields.");
    }
    this.response = {
      type: InteractionResponseType.ApplicationCommandAutocompleteResult,
      data: { choices },
    };
  }
}
