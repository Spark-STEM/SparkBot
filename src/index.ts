import {
  InteractionType,
  InteractionResponseType,
  type APIInteraction,
} from "discord-api-types/v10";
import type { Env } from "./types.ts";
import { verifyDiscordRequest } from "./verify.ts";
import { handleCommand } from "./commands/index.ts";
import { handleModalSubmit } from "./commands/modal-handlers.ts";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint for browser inspection or uptime monitors
    if (request.method === "GET") {
      return new Response(
        JSON.stringify({
          status: "online",
          bot: "SparkBot",
          platform: "Cloudflare Workers",
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // Ensure Discord Public Key is configured
    if (!env.DISCORD_PUBLIC_KEY) {
      console.error("DISCORD_PUBLIC_KEY secret is not set.");
      return new Response("Server configuration error: missing public key", {
        status: 500,
      });
    }

    // Verify incoming Discord signature (Ed25519)
    const { isValid, body } = await verifyDiscordRequest(request, env.DISCORD_PUBLIC_KEY);
    if (!isValid) {
      return new Response("Invalid request signature", { status: 401 });
    }

    const interaction: APIInteraction = JSON.parse(body);

    // Handle Discord ACK Ping (InteractionType.Ping = 1)
    if (interaction.type === InteractionType.Ping) {
      return new Response(
        JSON.stringify({ type: InteractionResponseType.Pong }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Handle Slash Commands (InteractionType.ApplicationCommand = 2)
    if (interaction.type === InteractionType.ApplicationCommand) {
      const response = await handleCommand(interaction, env);
      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle Modal Submissions (InteractionType.ModalSubmit = 5)
    if (interaction.type === InteractionType.ModalSubmit) {
      const response = await handleModalSubmit(interaction, env);
      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Unsupported interaction type" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  },
};
