import { timingSafeEqual } from "node:crypto";
import type { Env } from "../types.ts";
import type { Webhook } from "./types.ts";

const MAX_BODY_BYTES = 64 * 1024;

async function hash(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

// Bound the stream itself, including requests without a Content-Length header.
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

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function handlePagesWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
  }
  if (!env.CLOUDFLARE_WEBHOOK_SECRET) {
    return new Response("Webhook is not configured", { status: 503 });
  }
  const provided = request.headers.get("cf-webhook-auth") ?? "";
  const [actual, expected] = await Promise.all([hash(provided), hash(env.CLOUDFLARE_WEBHOOK_SECRET)]);
  if (!timingSafeEqual(actual, expected)) return new Response("Unauthorized", { status: 401 });

  let payload: unknown;
  try {
    const body = await readBody(request);
    if (body === null) return new Response("Payload Too Large", { status: 413 });
    payload = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (!record(payload) || typeof payload.text !== "string" || !payload.text.trim()) {
    return new Response("Missing notification text", { status: 400 });
  }
  // Cloudflare Save and Test sends only { text }. Acknowledge it without posting.
  if (Object.keys(payload).length === 1) return Response.json({ status: "test_received" });

  if (!env.CLOUDFLARE_PAGES_POLICY_ID || !env.DISCORD_TOKEN || !env.DEPLOY_NOTIFICATION_CHANNEL_ID) {
    return new Response("Notification delivery is not configured", { status: 503 });
  }
  // Pin the policy configured for spark-stem / production / deployment success.
  // Pages-specific data is not documented; do not guess its field names.
  if (payload.policy_id !== env.CLOUDFLARE_PAGES_POLICY_ID ||
      (payload.alert_type !== undefined && payload.alert_type !== "pages_event_alert")) {
    return Response.json({ status: "ignored" });
  }
  if (typeof payload.ts !== "number" || !Number.isSafeInteger(payload.ts) || payload.ts <= 0) {
    return new Response("Missing notification timestamp", { status: 400 });
  }

  try {
    const response = await fetch(`https://discord.com/api/v10/channels/1562641622276112384/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${env.DISCORD_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `**Website deployment update**\nhttps://spark-stem.pages.dev\n\n${payload.text}`.slice(0, 2000),
        allowed_mentions: { parse: [] },
        nonce: `${payload.ts}`,
        enforce_nonce: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error(`Discord message failed (${response.status})`);
    return Response.json({ status: "sent" });
  } catch {
    console.error(JSON.stringify({ event: "pages_notification_failed", timestamp: payload.ts }));
    return new Response("Notification delivery failed", { status: 502 });
  }
}

const webhook: Webhook = {
  pathname: "/webhooks/cloudflare/pages",
  handler: handlePagesWebhook,
};

export default webhook;