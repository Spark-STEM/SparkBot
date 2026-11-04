import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase, databaseInteraction, tableText, fullRowChunks, parseValue } from '../src/services/database-browser.ts';
import { commandDefinitions, handleAutocomplete } from '../src/handler/commands.ts';
import { databaseTables } from '../src/generated/databaseSchema.ts';
import type { Env } from '../src/types.ts';
import type { APIApplicationCommandInteraction, APIMessageComponentInteraction, APIModalSubmitInteraction, APIInteractionResponse, APIApplicationCommandAutocompleteInteraction } from 'discord-api-types/v10';

// SQLite-backed D1 adapter exercises the real SQL and transaction semantics, without remote writes.
function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE members(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, hours INTEGER DEFAULT 0, chapter_id INTEGER, discord_id TEXT);
    CREATE TABLE programs(id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, min_grade INTEGER, max_grade INTEGER, status TEXT, fee REAL, location TEXT);
    INSERT INTO members(name,email) VALUES ('Alice','alice@example.com'),('Bob','bob@example.com');`);
  class Prepared {
    params: (string | number | null)[] = [];
    constructor(readonly sql: string) {}
    bind(...params: (string | number | null)[]) { this.params = params; return this; }
    async all() { return { results: sqlite.prepare(this.sql).all(...this.params) }; }
    async first() { return sqlite.prepare(this.sql).get(...this.params) ?? null; }
    async run() { const info = sqlite.prepare(this.sql).run(...this.params); return { meta: { changes: Number(info.changes) } }; }
  }
  const db = { prepare: (sql: string) => new Prepared(sql), async batch(statements: Prepared[]) {
    sqlite.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
  const env = { SPARK_DB: db, EXECUTIVE_ROLE_ID: 'exec' } as unknown as Env;
  const base = { guild_id: 'guild', member: { user: { id: 'owner' }, roles: ['exec'] } };
  const open = (table = 'members') => openDatabase({ ...base, type: 2 } as APIApplicationCommandInteraction, env, table);
  const click = (id: string, overrides = {}) => databaseInteraction({ ...base, ...overrides, type: 3, data: { custom_id: id } } as APIMessageComponentInteraction, env);
  const submit = (id: string, values: Record<string, string | string[] | boolean>) => databaseInteraction({ ...base, type: 5, data: { custom_id: id, components: Object.entries(values).map(([custom_id, value]) => ({ type: 18, component: { type: Array.isArray(value) ? 22 : typeof value === 'boolean' ? 23 : 4, custom_id, ...(Array.isArray(value) ? { values: value } : { value }) } })) } } as APIModalSubmitInteraction, env);
  return { sqlite, env, base, open, click, submit };
}
function data(response: APIInteractionResponse): any { assert('data' in response); return response.data; }
function control(response: APIInteractionResponse, label: string): string {
  const found = data(response).components.flatMap((row: any) => row.components ?? []).find((c: any) => c.label === label);
  assert(found, `Missing button ${label}`); return found.custom_id;
}
function checkLimits(response: APIInteractionResponse) {
  const payload = data(response);
  const embeds = payload.embeds ?? [];
  assert(embeds.reduce((n: number, e: any) => n + (e.description?.length ?? 0) + (e.title?.length ?? 0) + (e.footer?.text?.length ?? 0), 0) <= 6000);
  for (const e of embeds) assert(e.description.length <= 4096);
}

test('registration serializes autocomplete; schema excludes junction tables', async () => {
  const command = commandDefinitions.find(c => c.name === 'database');
  assert.equal(command?.options?.[0]?.autocomplete, true);
  assert(!databaseTables.includes('member_roles' as never));
  assert(!databaseTables.includes('session_members' as never));
  const { env, base } = setup();
  const raw = { ...base, type: 4, data: { name: 'database', options: [{ name: 'table', type: 3, value: 'mem', focused: true }] } } as APIApplicationCommandAutocompleteInteraction;
  assert.deepEqual(data(await handleAutocomplete(raw, env)).choices, [{ name: 'members', value: 'members' }]);
  assert.deepEqual(data(await handleAutocomplete({ ...raw, member: { ...raw.member!, roles: [] } }, env)).choices, []);
});

test('permissions, ownership, expiry, and stale controls are enforced', async () => {
  const t = setup();
  assert.match(data(await openDatabase({ guild_id: 'guild', member: { roles: [] } } as unknown as APIApplicationCommandInteraction, t.env, 'members')).content, /executive/);
  const view = await t.open();
  assert.equal(data(view).flags, 64);
  const select = control(view, 'Select');
  assert.match(data(await t.click(select, { member: { user: { id: 'other' }, roles: ['exec'] } })).content, /someone else/);
  assert.match(data(await t.click(select, { member: { user: { id: 'owner' }, roles: [] } })).content, /executive/);
  const modal = await t.click(select);
  const focused = await t.submit(data(modal).custom_id, { key: '1' });
  checkLimits(focused);
  assert.match(data(await t.click(select)).content, /stale/);
  t.sqlite.exec('UPDATE _spark_database_sessions SET expires=0');
  assert.match(data(await t.click(control(focused, 'Edit'))).content, /expired/);
});

test('find focuses one match; filter controls columns; back preserves search', async () => {
  const t = setup();
  let view = await t.open();
  let modal = await t.click(control(view, 'Filter'));
  view = await t.submit(data(modal).custom_id, { columns0: ['name'] });
  assert.match(data(view).embeds[0].description, /Alice/);
  assert(!data(view).embeds[0].description.includes('email'));
  modal = await t.click(control(view, 'Find'));
  view = await t.submit(data(modal).custom_id, { column: ['name'], value: 'ALIC' });
  assert(control(view, 'Edit'));
  view = await t.click(control(view, 'Back'));
  assert.match(data(view).embeds[0].footer.text, /1 rows.*Search active/);
});

test('Add spans modals and only commits at the final step; replay cannot duplicate', async () => {
  const t = setup();
  let view = await t.open('programs');
  let modal = await t.click(control(view, 'Add'));
  assert.equal(data(modal).components.length, 5);
  view = await t.submit(data(modal).custom_id, { name: 'New program', description: 'Hello', min_grade: '1', max_grade: '5', status: 'active' });
  assert.equal(t.sqlite.prepare('SELECT count(*) AS n FROM programs').get()!.n, 0);
  modal = await t.click(control(view, 'Continue'));
  const finalId = data(modal).custom_id;
  view = await t.submit(finalId, { fee: '12.5', location: 'Here' });
  assert.equal(view.type, 7);
  assert.equal(t.sqlite.prepare('SELECT fee FROM programs').get()!.fee, 12.5);
  assert.match(data(await t.submit(finalId, { fee: '12.5' })).content, /stale/);
  assert.equal(t.sqlite.prepare('SELECT count(*) AS n FROM programs').get()!.n, 1);
});

test('Edit preserves blank fields and Delete requires confirmation; conflicting edits cannot overwrite', async () => {
  const t = setup();
  let view = await t.open();
  let modal = await t.click(control(view, 'Select'));
  view = await t.submit(data(modal).custom_id, { key: '1' });
  modal = await t.click(control(view, 'Edit'));
  view = await t.submit(data(modal).custom_id, { name: 'Alicia', email: '', hours: '3', chapter_id: 'NULL', discord_id: 'NULL' });
  assert.equal(t.sqlite.prepare('SELECT name FROM members WHERE id=1').get()!.name, 'Alicia');
  assert.equal(t.sqlite.prepare('SELECT email FROM members WHERE id=1').get()!.email, 'alice@example.com');
  const focused = view;
  view = await t.click(control(view, 'Delete'));
  assert.equal(t.sqlite.prepare('SELECT count(*) AS n FROM members').get()!.n, 2);
  view = await t.click(control(view, 'Cancel'));
  view = await t.click(control(view, 'Delete'));
  const confirm = control(view, 'Delete permanently');
  view = await t.click(confirm);
  assert.equal(t.sqlite.prepare('SELECT count(*) AS n FROM members').get()!.n, 1);
  assert.match(data(await t.click(confirm)).content, /stale/);
  assert.match(data(await t.click(control(focused, 'Edit'))).content, /stale/);

  view = await t.open(); modal = await t.click(control(view, 'Select'));
  view = await t.submit(data(modal).custom_id, { key: '2' });
  modal = await t.click(control(view, 'Edit'));
  t.sqlite.exec("UPDATE members SET name='Concurrent change' WHERE id=2");
  const result = await t.submit(data(modal).custom_id, { name: 'Overwrite', hours: '5' });
  assert.match(data(result).content, /changed/);
  assert.equal(t.sqlite.prepare('SELECT name FROM members WHERE id=2').get()!.name, 'Concurrent change');
});

test('closing a modal leaves original controls usable, and cancelled drafts never write', async () => {
  const t = setup(); const view = await t.open('programs');
  await t.click(control(view, 'Add'));
  const draft = await t.click(control(view, 'Next'));
  const cancelled = await t.click(control(draft, 'Cancel'));
  assert(control(cancelled, 'Add'));
  assert.equal(t.sqlite.prepare('SELECT count(*) AS n FROM programs').get()!.n, 0);
});

test('pagination and long text remain bounded; values validate without SQL interpolation', async () => {
  const t = setup();
  for (let i = 0; i < 20; i++) t.sqlite.prepare('INSERT INTO members(name) VALUES (?)').run(`row ${i}`);
  let view = await t.open(); checkLimits(view);
  assert.match(data(view).embeds[0].footer.text, /Page 1\/3/);
  view = await t.click(control(view, 'Next')); checkLimits(view);
  assert.match(data(view).embeds[0].footer.text, /Page 2\/3/);
  const long = 'A'.repeat(20000) + '```';
  assert(tableText(['name'], [{ name: long }]).length < 4096);
  const chunks = fullRowChunks({ name: long, email: 'test' }, ['name', 'email']);
  assert(chunks.length > 1); assert(chunks.every(c => c.length < 4096));
  assert.equal(chunks.join('').split('A').length - 1, 20000);
  const c = { name: 'n', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 0, hidden: 0 };
  assert.throws(() => parseValue('2.5', c)); assert.throws(() => parseValue('NULL', c));
  assert.throws(() => parseValue('9007199254740993', c));
  assert.equal(parseValue("Robert'); DROP TABLE members;--", { ...c, type: 'TEXT' }), "Robert'); DROP TABLE members;--");
});
