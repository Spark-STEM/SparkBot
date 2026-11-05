import type { SlashCommand } from './types.ts';
import { databaseTables } from '../generated/databaseSchema.ts';
import { authorized, openDatabase } from '../services/database-browser.ts';

const command: SlashCommand = {
  name: 'database', description: 'Browse and manage database rows (executives and tech team)', type: 1,
  options: [{ name: 'table', description: 'Table to browse', type: 3, required: true,
    async autocomplete(client, interaction) {
      const query = String(interaction.options.getFocused()).toLowerCase();
      await interaction.respond(authorized(interaction.raw, client.env)
        ? databaseTables.filter(name => name.toLowerCase().includes(query)).slice(0, 25).map(name => ({ name, value: name })) : []);
    },
  }],
  async run(client, interaction) {
    await openDatabase(interaction, client.env, interaction.options.getString('table') ?? '');
  },
};
export default command;
