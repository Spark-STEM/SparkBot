import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Database, type SQLQueryBindings } from "bun:sqlite";
import { readFileSync } from "node:fs";
import worker from "../src/index.ts";
import type { Env } from "../src/types.ts";

const endpoint = "https://spark.example/webhooks/cloudflare/pages";
const event = { policy_id: "pages-policy", alert_type: "pages_event_alert", ts: 1792600000,
  text: "spark-stem production deployment succeeded. @everyone", data: { deployment_id: "deploy-1" } };

function fixture() {
  const sqlite = new Database(":memory:");
  sqlite.exec(readFileSync("migrations/0004_deployment_notifications.sql", "utf8"));
  const db = {
    prepare(sql: string) {
      let args: SQLQueryBindings[] = [];
      const statement = {
        bind(...values: SQLQueryBindings[]) { args = values; return statement; },
        async first() { return sqlite.query(sql).get(...args); },
        async run() { return { meta: { changes: sqlite.query(sql).run(...args).changes } }; },
      };
      return statement;
    },
  } as unknown as D1Database;
  const env: Env = { SPARK_DB: db, DISCORD_PUBLIC_KEY: "unused", DISCORD_TOKEN: "test-bot-token",
    CLOUDFLARE_WEBHOOK_SECRET: "test-shared-secret", CLOUDFLARE_PAGES_POLICY_ID: "pages-policy",
    DEPLOY_NOTIFICATION_CHANNEL_ID: "1334032077955268679" };
  const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ id: "message-1" }));
  async function send(payload: unknown = event, secret = "test-shared-secret", method = "POST") {
    return worker.fetch(new Request(endpoint, { method,
      headers: { "cf-webhook-auth": secret },
      ...(method === "POST" ? { body: typeof payload === "string" ? payload : JSON.stringify(payload) } : {}),
    }), env, {} as ExecutionContext);
  }
  return { sqlite, env, fetchMock, send };
}

afterEach(() => mock.restore());

describe("Pages webhook", () => {
  it("posts as Spark to #tech, disables mentions and deduplicates retries", async () => {
    const { send, fetchMock } = fixture();
    expect((await send()).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://discord.com/api/v10/channels/1334032077955268679/messages");
    expect(init?.headers).toMatchObject({ Authorization: "Bot test-bot-token" });
    const body = JSON.parse(init?.body as string);
    expect(body.content).toContain("https://spark-stem.pages.dev");
    expect(body.content).toContain(event.text);
    expect(body.allowed_mentions).toEqual({ parse: [] });
    expect(body.enforce_nonce).toBe(true);
    expect(body.nonce).toHaveLength(24);
    expect(await (await send()).json()).toEqual({ status: "duplicate" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await send({ ...event, ts: event.ts + 1 })).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects unauthenticated requests and unsupported methods", async () => {
    const { send, env, fetchMock } = fixture();
    expect((await send(event, "wrong")).status).toBe(401);
    expect((await send(event, "")).status).toBe(401);
    expect((await send(event, "test-shared-secret", "GET")).status).toBe(405);
    env.CLOUDFLARE_WEBHOOK_SECRET = undefined;
    expect((await send()).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("acknowledges Save and Test without a Discord post", async () => {
    const { send, env, fetchMock } = fixture();
    env.CLOUDFLARE_PAGES_POLICY_ID = undefined;
    expect(await (await send({ text: "Hello World! Test webhook." })).json()).toEqual({ status: "test_received" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores other policies and alert types and fails closed without configuration", async () => {
    const { send, env, fetchMock } = fixture();
    expect(await (await send({ ...event, policy_id: "other-policy" })).json()).toEqual({ status: "ignored" });
    expect(await (await send({ ...event, alert_type: "other-alert" })).json()).toEqual({ status: "ignored" });
    env.CLOUDFLARE_PAGES_POLICY_ID = undefined;
    expect((await send()).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed and oversized bodies", async () => {
    const { send, fetchMock } = fixture();
    for (const payload of ["{", null, [], { ...event, text: " " }, { ...event, ts: undefined }]) {
      expect((await send(payload)).status).toBe(400);
    }
    expect((await send({ ...event, text: "x".repeat(65536) })).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows retry after Discord fails and uses the same nonce", async () => {
    const { send, fetchMock } = fixture();
    fetchMock.mockResolvedValueOnce(new Response("rate limited", { status: 429 }));
    expect((await send()).status).toBe(502);
    expect((await send()).status).toBe(200);
    const nonces = fetchMock.mock.calls.map(([, init]) => JSON.parse(init?.body as string).nonce);
    expect(nonces[0]).toBe(nonces[1]);
  });

  it("does not send concurrently and reclaims an expired delivery lease", async () => {
    const { send, sqlite, fetchMock } = fixture();
    let release!: () => void;
    const pending = new Promise<Response>(resolve => {
      release = () => resolve(Response.json({ id: "message-1" }));
    });
    fetchMock.mockImplementationOnce(Object.assign(() => pending, { preconnect: fetch.preconnect }));
    const first = send();
    // Wait for the first request to acquire its lease and reach Discord.
    for (let i = 0; i < 100 && fetchMock.mock.calls.length === 0; i++) await Bun.sleep(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const second = await send();
    release();
    expect(second.status).toBe(503);
    expect((await first).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    sqlite.exec("UPDATE deployment_notifications SET delivered_at = NULL, lease_until = 0");
    expect((await send()).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
