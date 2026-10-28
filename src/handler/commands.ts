import { InteractionResponseType, type APIApplicationCommandAutocompleteInteraction, type APIApplicationCommandInteraction, type APIInteractionResponse } from "discord-api-types/v10";
import type { Env } from "../types.ts";
import type { SlashCommand } from "../slashcommands/types.ts";
import { AutocompleteInteraction } from "../discordBS/interactions/autocomplete.ts";
import { CommandInteraction } from "../discordBS/interactions/slash.ts";
import { DiscordClient } from "../discordBS/index.ts";
import ping from "../slashcommands/ping.ts";
import stats from "../slashcommands/stats.ts";
import chapters from "../slashcommands/chapters.ts";
import programs from "../slashcommands/programs.ts";

export const commands: SlashCommand[] = [ping, stats, chapters, programs];
export const commandDefinitions = commands.map(({ run, ...definition }) => definition);

function findFocused(options: readonly { name: string; focused?: boolean; options?: readonly any[] }[]): string | undefined {
  for (const option of options) {
    if (option.focused) return option.name;
    if (option.options) {
      const focused = findFocused(option.options);
      if (focused) return focused;
    }
  }
}

function findOption(options: readonly any[], name: string): any {
  for (const option of options) {
    if (option.name === name) return option;
    if (option.options) {
      const found = findOption(option.options, name);
      if (found) return found;
    }
  }
}

export async function handleSlashCommand(interaction: APIApplicationCommandInteraction, env: Env): Promise<APIInteractionResponse> {
  const command = commands.find(({ name }) => name === interaction.data.name);
  if (!command) {
    return { type: 4, data: { content: `⚠️ Unknown command: \`/${interaction.data.name}\`` } };
  }

  const client = new DiscordClient(env, commands);
  const wrapped = new CommandInteraction(interaction, env);
  await command.run(client, wrapped);
  return wrapped.response ?? { type: 4, data: { content: "The command did not send a response." } };
}

export async function handleAutocomplete(interaction: APIApplicationCommandAutocompleteInteraction, env: Env): Promise<APIInteractionResponse> {
  const command = commands.find(({ name }) => name === interaction.data.name);
  const focused = findFocused(interaction.data.options ?? []);
  const option = focused && command && findOption(interaction.data.options ?? [], focused);
  if (!option?.autocomplete) {
    return { type: InteractionResponseType.ApplicationCommandAutocompleteResult, data: { choices: [] } };
  }
  const client = new DiscordClient(env, commands);
  const wrapped = new AutocompleteInteraction(interaction, env);
  await option.autocomplete(client, wrapped);
  return wrapped.response ?? { type: InteractionResponseType.ApplicationCommandAutocompleteResult, data: { choices: [] } };
}
