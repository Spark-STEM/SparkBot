import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { findMemberCandidates, matchScore, registerMemberInDb } from "../src/services/member.ts";
import { requestConfirmation, handleRegistrationConfirmation, finishRegistration } from "../src/commands/registration-confirmation.ts";
import type { Env } from "../src/types.ts";
import type { APIMessageComponentInteraction } from "discord-api-types/v10";

function fixture() {
  const sqlite = new Database(":memory:");
  for (const path of ["0001_initial.sql", "0002_add_discord_id.sql", "0003_registration_confirmation.sql"]) sqlite.exec(readFileSync(`migrations/${path}`, "utf8"));
  sqlite.exec("INSERT INTO chapters (id, city, country) VALUES (1, 'Test', 'US'); INSERT INTO members (name, chapter_id, hours) VALUES ('Cloud H[u]', 1, 42)");
  const db = {
    prepare(sql: string) {
      let args: any[] = [];
      const statement = {
        bind(...values: any[]) { args = values; return statement; },
        async first() { return sqlite.query(sql).get(...args); },
        async all() { return { results: sqlite.query(sql).all(...args) }; },
        async run() { const result = sqlite.query(sql).run(...args); return { success: true, meta: { changes: result.changes, last_row_id: Number(result.lastInsertRowid) } }; },
      };
      return statement;
    },
    async batch(statements: { run(): Promise<any> }[]) {
      sqlite.exec("BEGIN");
      try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec("COMMIT"); return results; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  } as unknown as D1Database;
  return { sqlite, db, env: { SPARK_DB: db } as Env };
}
async function confirmation(env: Env) {
  const response = await requestConfirmation(env, { discordId: "user1", name: "Cloud H", chapterId: 1 }, [{ id: 1, name: "Cloud H[u]", chapter_id: 1 }]);
  return (response as any).data.components[0].components[0].custom_id as string;
}
function click(id: string, choice: string, user = "user1") {
  return { data: { custom_id: id, values: [choice] }, user: { id: user } } as unknown as APIMessageComponentInteraction;
}

describe("registration deduplication", () => {
  it("matches initials, punctuation, case and modest typos conservatively", () => {
    expect(matchScore("Cloud H", "Cloud H[u]")).not.toBeNull();
    expect(matchScore(" CLOUD H. ", "cloud h")).toBe(0);
    expect(matchScore("Cluod H", "Cloud H")).toBeNull();
    expect(matchScore("Cloud H", "Claud H")).not.toBeNull();
    expect(matchScore("Al H", "Ali H")).toBeNull();
    expect(matchScore("Cloud H", "Cloud J")).toBeNull();
  });
  it("uses the submitted text for the Discord nickname", async () => {
    const { env } = fixture();
    const originalFetch = globalThis.fetch;
    let nickname: string | undefined;
    globalThis.fetch = (async (_url: any, options: any) => {
      nickname = JSON.parse(options.body).nick;
      return new Response("{}");
    }) as typeof fetch;
    try {
      await finishRegistration({ ...env, DISCORD_TOKEN: "test-token" }, "user1", "guild1", "Cloud H");
      expect(nickname).toBe("Cloud H");
    } finally { globalThis.fetch = originalFetch; }
  });
  it("finds imported unlinked members", async () => {
    const { db } = fixture();
    expect((await findMemberCandidates(db, "Cloud H", 1)).map(m => m.id)).toEqual([1]);
  });
  it("links without replacing member data and ignores repeated confirmation", async () => {
    const { sqlite, env } = fixture();
    sqlite.exec("INSERT INTO roles (id, name) VALUES (1, 'Volunteer'); INSERT INTO member_roles VALUES (1, 1)");
    const id = await confirmation(env);
    await handleRegistrationConfirmation(click(id, "1"), env);
    await handleRegistrationConfirmation(click(id, "1"), env);
    expect(sqlite.query("SELECT name, hours, discord_id FROM members").all()).toEqual([{ name: "Cloud H[u]", hours: 42, discord_id: "user1" }]);
    expect(sqlite.query("SELECT * FROM member_roles").all()).toHaveLength(1);
  });
  it("creates once when the user declines matches", async () => {
    const { sqlite, env } = fixture(); const id = await confirmation(env);
    await handleRegistrationConfirmation(click(id, "new"), env);
    await handleRegistrationConfirmation(click(id, "new"), env);
    expect(sqlite.query("SELECT name FROM members ORDER BY id").all()).toEqual([{ name: "Cloud H[u]" }, { name: "Cloud H" }]);
  });
  it("rejects other users, unoffered records, expired requests and claimed candidates", async () => {
    const { sqlite, env } = fixture(); const id = await confirmation(env);
    await handleRegistrationConfirmation(click(id, "1", "other"), env);
    await handleRegistrationConfirmation(click(id, "2"), env);
    expect(sqlite.query("SELECT discord_id FROM members").get()).toEqual({ discord_id: null });
    sqlite.exec("UPDATE members SET discord_id = 'other'");
    await handleRegistrationConfirmation(click(id, "1"), env);
    expect(sqlite.query("SELECT discord_id FROM members").get()).toEqual({ discord_id: "other" });
    sqlite.exec("UPDATE registration_confirmations SET expires_at = 0");
    await handleRegistrationConfirmation(click(id, "new"), env);
    expect(sqlite.query("SELECT * FROM members").all()).toHaveLength(1);
  });
  it("keeps the canonical name on subsequent registration", async () => {
    const { sqlite, db } = fixture(); sqlite.exec("UPDATE members SET discord_id = 'user1'");
    await registerMemberInDb(db, { name: "Cloud H", chapterId: 1, discordId: "user1" });
    expect(sqlite.query("SELECT name FROM members").get()).toEqual({ name: "Cloud H[u]" });
  });
});
