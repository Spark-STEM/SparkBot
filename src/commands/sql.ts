import {
  InteractionResponseType,
  type APIApplicationCommandInteraction,
  type APIInteractionResponse,
  type APIApplicationCommandInteractionDataStringOption,
} from "discord-api-types/v10";
import type { Env } from "../types.ts";
import { checkIsAdmin } from "../services/permissions.ts";
import { executeSqlQuery, formatSqlResult } from "../services/sql.ts";

export async function handleSqlCommand(
  interaction: APIApplicationCommandInteraction,
  env: Env
): Promise<APIInteractionResponse> {
  const permissions = interaction.member?.permissions;
  const userId = interaction.member?.user?.id || interaction.user?.id;

  // Check Admin via Discord Permission, env ADMIN_USER_IDS, or D1 member_roles
  const isAdmin = await checkIsAdmin({
    permissions,
    userId,
    adminUserIds: env.ADMIN_USER_IDS,
    db: env.SPARK_DB,
  });

  if (!isAdmin) {
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: "⛔ **Permission Denied**: You must be an Administrator (via server role, bot config, or DB Admin Team) to run `/sql` queries.",
        flags: 64, // Ephemeral
      },
    };
  }

  // Extract SQL query option
  const options = (interaction.data as any).options as any[] | undefined;
  const queryOption = options?.find(
    (opt) => opt.name === "query"
  ) as APIApplicationCommandInteractionDataStringOption | undefined;

  const sql = queryOption?.value?.trim();

  if (!sql) {
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: "❌ Please provide a SQL query to execute. Example: `/sql query:SELECT * FROM chapters;`",
        flags: 64,
      },
    };
  }

  // Execute SQL
  const result = await executeSqlQuery(env.SPARK_DB, sql);
  const formatted = formatSqlResult(result);

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: formatted,
      flags: 64, // Ephemeral
    },
  };
}
