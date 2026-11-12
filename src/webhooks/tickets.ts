import { timingSafeEqual } from "node:crypto";
import { DiscordClient } from "../discordBS/index.ts";
import { createTicket, TICKET_GUILD_ID } from "../services/tickets.ts";
import type { Env } from "../types.ts";
import type { Webhook } from "./types.ts";

const MAX_BODY_BYTES = 8 * 1024;
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function hash(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function readBody(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return body + decoder.decode();
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

export async function handleTicketApi(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
  }
  if (!env.TICKET_API_SECRET) {
    return new Response("Ticket API is not configured", { status: 503 });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const [actual, expected] = await Promise.all([hash(provided), hash(env.TICKET_API_SECRET)]);
  if (!provided || !timingSafeEqual(actual, expected)) return new Response("Unauthorized", { status: 401 });

  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    return new Response("Content-Type must be application/json", { status: 415 });
  }

  let payload: unknown;
  try {
    const body = await readBody(request);
    if (body === null) return new Response("Payload Too Large", { status: 413 });
    payload = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (!isRecord(payload) ||
      typeof payload.channelName !== "string" ||
      !payload.channelName.trim() ||
      typeof payload.userId !== "string" ||
      !/^[1-9]\d*$/.test(payload.userId.trim())) {
    return new Response("channelName and a valid Discord userId are required", { status: 400 });
  }

  const embedTitle = payload.embedTitle === undefined ? "Ticket" : payload.embedTitle;
  const topic = payload.topic === undefined ? "" : payload.topic;
  if (typeof embedTitle !== "string" || !embedTitle.trim() || embedTitle.length > 240 ||
      typeof topic !== "string" || topic.length > 3900) {
    return new Response("embedTitle must be 1-240 characters and topic must be at most 3900 characters", {
      status: 400,
    });
  }

  try {
    const client = new DiscordClient(env, []);
    const channelId = await createTicket({
      client,
      userId: payload.userId.trim(),
      channelName: payload.channelName.trim(),
      embedTitle: embedTitle.trim(),
      topic,
    });
    return Response.json({
      status: "created",
      channelId,
      channelUrl: `https://discord.com/channels/${TICKET_GUILD_ID}/${channelId}`,
    });
  } catch (error) {
    console.error("Ticket creation API failed", error);
    return new Response("Ticket creation failed", { status: 502 });
  }
}

const webhook: Webhook = {
  pathname: "/api/tickets",
  handler: handleTicketApi,
};

export default webhook;
