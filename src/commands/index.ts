import {
  InteractionResponseType,
  ApplicationCommandOptionType,
  type APIApplicationCommandInteraction,
  type APIInteractionResponse,
} from "discord-api-types/v10";
import type { Env } from "../types.ts";
import { handleRegisterCommand } from "./register.ts";
import { handleSqlCommand } from "./sql.ts";

export interface CommandOption {
  name: string;
  description: string;
  type: number;
  required?: boolean;
}

export interface CommandDefinition {
  name: string;
  description: string;
  options?: CommandOption[];
}

export const COMMANDS: CommandDefinition[] = [
  {
    name: "register",
    description: "Register as a Spark member (select chapter, country & set nickname)",
  },
  {
    name: "sql",
    description: "Execute a SQL query against the Spark D1 database (Admin only)",
    options: [
      {
        name: "query",
        description: "The SQL statement to execute",
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
  {
    name: "ping",
    description: "Replies with Pong and confirms the bot is alive!",
  },
  {
    name: "stats",
    description: "Displays summary statistics from the Spark organization database",
  },
  {
    name: "chapters",
    description: "Lists active chapters from the database",
  },
  {
    name: "programs",
    description: "Lists active programs and partner schools",
  },
];

export async function handleCommand(
  interaction: APIApplicationCommandInteraction,
  env: Env
): Promise<APIInteractionResponse> {
  const { name } = interaction.data;

  switch (name) {
    case "register":
      return handleRegisterCommand(interaction, env);

    case "sql":
      return handleSqlCommand(interaction, env);

    case "ping": {
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: "🏓 Pong! SparkBot worker is running smoothly on Cloudflare Edge.",
        },
      };
    }

    case "stats": {
      try {
        const [chapters, schools, programs, members] = await Promise.all([
          env.SPARK_DB.prepare("SELECT COUNT(*) as count FROM chapters").first<{ count: number }>(),
          env.SPARK_DB.prepare("SELECT COUNT(*) as count FROM schools").first<{ count: number }>(),
          env.SPARK_DB.prepare("SELECT COUNT(*) as count FROM programs").first<{ count: number }>(),
          env.SPARK_DB.prepare("SELECT COUNT(*) as count FROM members").first<{ count: number }>(),
        ]);

        const content = [
          "📊 **Spark Organization Overview**",
          `• **Chapters:** ${chapters?.count ?? 0}`,
          `• **Schools:** ${schools?.count ?? 0}`,
          `• **Programs:** ${programs?.count ?? 0}`,
          `• **Members:** ${members?.count ?? 0}`,
        ].join("\n");

        return {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: { content },
        };
      } catch (err: any) {
        return {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: `❌ Error querying database: ${err.message || String(err)}`,
          },
        };
      }
    }

    case "chapters": {
      try {
        const { results } = await env.SPARK_DB.prepare(
          "SELECT id, name, city, region, country FROM chapters ORDER BY country, city LIMIT 10"
        ).all<{ id: number; name: string | null; city: string; region: string | null; country: string }>();

        if (!results || results.length === 0) {
          return {
            type: InteractionResponseType.ChannelMessageWithSource,
            data: { content: "ℹ️ No chapters found in the database yet." },
          };
        }

        const lines = results.map(
          (c) => `• **${c.name || c.city}** — ${c.city}, ${c.region ? c.region + ", " : ""}${c.country}`
        );

        return {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: `🏛️ **Active Chapters (${results.length}):**\n${lines.join("\n")}`,
          },
        };
      } catch (err: any) {
        return {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: `❌ Error retrieving chapters: ${err.message || String(err)}`,
          },
        };
      }
    }

    case "programs": {
      try {
        const { results } = await env.SPARK_DB.prepare(
          `SELECT p.id, p.name as program_name, p.status, s.name as school_name
           FROM programs p
           LEFT JOIN schools s ON p.school_id = s.id
           ORDER BY p.id DESC
           LIMIT 10`
        ).all<{ id: number; program_name: string; status: string; school_name: string | null }>();

        if (!results || results.length === 0) {
          return {
            type: InteractionResponseType.ChannelMessageWithSource,
            data: { content: "ℹ️ No programs found in the database yet." },
          };
        }

        const lines = results.map(
          (p) => `• **${p.program_name}** at *${p.school_name || "Unknown School"}* [Status: \`${p.status}\`]`
        );

        return {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: `📚 **Recent Programs:**\n${lines.join("\n")}`,
          },
        };
      } catch (err: any) {
        return {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: `❌ Error retrieving programs: ${err.message || String(err)}`,
          },
        };
      }
    }

    default: {
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: `⚠️ Unknown command: \`/${name}\``,
        },
      };
    }
  }
}
