import type { APIInteractionResponse } from "discord-api-types/v10";
import type { AutocompleteInteraction } from "../discordBS/interactions/autocomplete.ts";
import type { CommandInteraction } from "../discordBS/interactions/slash.ts";
import type { DiscordClient } from "../discordBS/index.ts";

export interface SlashCommandOption {
  name: string;
  description: string;
  type: number;
  required?: boolean;
  autocomplete?: (client: DiscordClient, interaction: AutocompleteInteraction) => Promise<void>;
}

export interface SlashCommand {
  name: string;
  description: string;
  type?: number;
  options?: SlashCommandOption[];
  run: (client: DiscordClient, interaction: CommandInteraction) => Promise<void>;
}
