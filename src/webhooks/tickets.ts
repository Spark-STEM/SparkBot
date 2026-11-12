import { timingSafeEqual } from "node:crypto";
import { DiscordClient } from "../discordBS/index.ts";
import { createTicket, TICKET_GUILD_ID } from "../services/tickets.ts";
import type { Env } from "../types.ts";
import type { Webhook } from "./types.ts";

const MAX_BODY_BYTES = 8 * 1024;
const CONTACT_TICKET_OPENER_ID = "1409557350729257090";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validDiscordId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d*$/.test(value.trim());
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
      typeof payload.category !== "string" ||
      !payload.category.trim() ||
      typeof payload.email !== "string" ||
      !payload.email.trim() ||
      typeof payload.message !== "string" ||
      !payload.message.trim() ||
      typeof payload.subject !== "string" ||
      !payload.subject.trim()) {
    return new Response("category, email, message, and subject are required", { status: 400 });
  }

  const category = payload.category.trim();
  const rawChapterName = payload.chapterName ?? payload.Chapter;
  const chapterName = typeof rawChapterName === "string" ? rawChapterName.trim() : "";
  const email = payload.email.trim();
  const message = payload.message.trim();
  const subject = payload.subject.trim();
  if (category.length > 100 || email.length > 320 || message.length > 3500 ||
      !subject || subject.length > 240 ||
      chapterName.length > 100) {
    return new Response("Contact form fields are missing or exceed their allowed lengths", { status: 400 });
  }

  try {
    let chapterLeadIds: string[] = [];
    if (category.toLowerCase() === "chapter" && chapterName) {
      const chapter = await env.database.query<{ id: number }>(
        `SELECT id
         FROM chapters
         WHERE lower(trim(name)) = lower(trim(?))
         LIMIT 1`,
        chapterName,
      ).first();
      if (chapter) {
        const leadRows = await env.database.query<{ discord_id: unknown }>(
          `SELECT DISTINCT members.discord_id
           FROM members
           JOIN member_roles ON member_roles.member_id = members.id
           JOIN roles ON roles.id = member_roles.role_id
           WHERE members.chapter_id = ?
             AND members.discord_id IS NOT NULL
             AND lower(trim(roles.name)) IN ('chapter lead', 'chapter vice lead', 'vice lead')`,
          chapter.id,
        ).all();
        chapterLeadIds = [...new Set(leadRows.map((row) => row.discord_id).filter(validDiscordId))];
      }
    }

    const ticketId = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const topic = [
      `Category: ${category}`,
      ...(chapterName ? [`Chapter: ${chapterName}`] : []),
      `Email: ${email}`,
      `Message:\n${message}`,
    ].join("\n\n");
    if (topic.length > 3900) {
      return new Response("The combined contact details are too long", { status: 400 });
    }

    const client = new DiscordClient(env, []);
    const channelId = await createTicket({
      client,
      userId: CONTACT_TICKET_OPENER_ID,
      channelName: `Contact-${ticketId}`,
      embedTitle: `Contact: ${subject}`,
      topic,
      whitelist: { userIds: chapterLeadIds, roleIds: [] },
    });
    return Response.json({
      status: "created",
      ticketId,
      channelId,
      channelUrl: `https://discord.com/channels/${TICKET_GUILD_ID}/${channelId}`,
      chapterReviewerCount: chapterLeadIds.length,
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
