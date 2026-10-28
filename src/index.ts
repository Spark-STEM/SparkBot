import {
  InteractionType,
  InteractionResponseType,
  type APIInteraction,
} from "discord-api-types/v10";
import { verifyKey } from "discord-interactions";
import type { Env } from "./types.ts";
import { handleSlashCommand } from "./handler/commands.ts";
import { handleAutocomplete } from "./handler/commands.ts";
import { handleComponent } from "./handler/components.ts";
import { handleModal } from "./handler/modals.ts";
import { webhooks } from "./generated/registry.ts";
import { Database } from "./services/database.ts";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    env.database ??= new Database(env.SPARK_DB);
    const url = new URL(request.url);

    const webhook = webhooks.find(({ pathname }) => pathname === url.pathname);
    if (webhook) return webhook.handler(request, env);

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
    const signature = request.headers.get("x-signature-ed25519");
    const timestamp = request.headers.get("x-signature-timestamp");
    const body = await request.text();
    const isValid = Boolean(signature && timestamp && await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY));
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
      const response = await handleSlashCommand(interaction, env);
      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
      return Response.json(await handleAutocomplete(interaction, env));
    }

    if (interaction.type === InteractionType.MessageComponent) {
      const response = await handleComponent(interaction, env);
      return Response.json(response);
    }

    // Handle Modal Submissions (InteractionType.ModalSubmit = 5)
    if (interaction.type === InteractionType.ModalSubmit) {
      const response = await handleModal(interaction, env);
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
