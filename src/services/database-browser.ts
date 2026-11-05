import type { APIApplicationCommandInteraction, APIApplicationCommandAutocompleteInteraction, APIMessageComponentInteraction, APIModalSubmitInteraction, APIInteractionResponse, APIInteractionResponseCallbackData } from 'discord-api-types/v10';
import { buildDraftMessage, buildDeleteMessage, buildRowMessage, buildTableMessage, buildRowForm, buildSelectRowModal, buildSearchModal, buildColumnFilterModal, errorResponse, initialResponse, updateResponse } from './database-browser-ui.ts';
export { display, tableText, fullRowChunks } from './database-browser-ui.ts';
import { databaseTables } from '../generated/databaseSchema.ts';
import type { Env } from '../types.ts';

type Interaction = APIApplicationCommandInteraction | APIMessageComponentInteraction | APIModalSubmitInteraction;
import type { Value, Row, Column, Schema, Session } from './database-browser-types.ts';
export type { Column } from './database-browser-types.ts';
const sessionTable = '_spark_database_sessions';
const pageSize = 8;
const ttl = 60 * 60 * 1000;
export const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
export function authorized(raw: Interaction | APIApplicationCommandAutocompleteInteraction, env: Env): boolean {
  const allowedRoles = [
    env.EXECUTIVE_ROLE_ID || '1334030809577029713',
    env.TECH_ROLE_ID || '1546728101772529674',
  ];
  return Boolean(raw.guild_id && raw.member?.roles.some(role => allowedRoles.includes(role)));
}
const userId = (raw: Interaction) => (raw.member?.user ?? raw.user)?.id;
class InputError extends Error {}
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new InputError(message); }

async function schema(env: Env, table: string): Promise<Schema> {
  assert((databaseTables as readonly string[]).includes(table), 'Choose a table from autocomplete.');
  const { results: columns } = await env.SPARK_DB.prepare(`PRAGMA table_xinfo(${quote(table)})`).all<Column>();
  assert(columns.length, 'This table no longer exists. Regenerate the schema.');
  const keys = columns.filter(c => c.pk).sort((a, b) => a.pk - b.pk).map(c => c.name);
  // SQLite rowid is available for ordinary tables without a declared primary key.
  if (!keys.length) {
    assert(!columns.some(c => ['rowid', '_rowid_', 'oid'].includes(c.name.toLowerCase())), 'This table has no usable row identifier.');
    keys.push('_rowid_');
  }
  return { columns, keys };
}
async function initialize(env: Env) {
  await env.SPARK_DB.prepare(`CREATE TABLE IF NOT EXISTS ${sessionTable} (id TEXT PRIMARY KEY, owner TEXT NOT NULL, guild TEXT NOT NULL, revision INTEGER NOT NULL, expires INTEGER NOT NULL, state TEXT NOT NULL)`).run();
  await env.SPARK_DB.prepare(`DELETE FROM ${sessionTable} WHERE expires < ?`).bind(Date.now()).run();
}
function predicate(keys: string[], values: Value[]) {
  assert(values.length === keys.length, 'Invalid row identifier.');
  return { sql: keys.map(k => `${quote(k)} IS ?`).join(' AND '), params: values };
}
function rowKey(row: Row, meta: Schema) { return meta.keys.map(k => row[k] ?? null); }
async function getRow(env: Env, s: Session, meta: Schema): Promise<Row> {
  assert(s.state.focus, 'Select a row first.');
  const where = predicate(meta.keys, s.state.focus);
  const row = await env.SPARK_DB.prepare(`SELECT ${meta.keys[0] === '_rowid_' ? '_rowid_, ' : ''}* FROM ${quote(s.state.table)} WHERE ${where.sql}`).bind(...where.params).first<Row>();
  assert(row, 'This row no longer exists. Use Back to return to the table.');
  return row;
}
async function render(env: Env, s: Session, meta: Schema): Promise<APIInteractionResponseCallbackData> {
  const st = s.state;
  if (st.draft) return buildDraftMessage(s);
  if (st.deleting) return buildDeleteMessage(s);
  if (st.focus) {
    const row = await getRow(env, s, meta);
    return buildRowMessage(s, row, meta);
  }
  const filter = st.search ? ` WHERE instr(lower(CAST(${quote(st.search.column)} AS TEXT)), lower(?)) > 0` : '';
  const params = st.search ? [st.search.value] : [];
  const count = await env.SPARK_DB.prepare(`SELECT count(*) AS n FROM ${quote(st.table)}${filter}`).bind(...params).first<{ n: number }>();
  const pages = Math.max(1, Math.ceil((count?.n ?? 0) / pageSize));
  st.page = Math.max(0, Math.min(st.page, pages - 1));
  const { results } = await env.SPARK_DB.prepare(`SELECT ${meta.keys[0] === '_rowid_' ? '_rowid_, ' : ''}* FROM ${quote(st.table)}${filter} ORDER BY ${meta.keys.map(quote).join(', ')} LIMIT ? OFFSET ?`).bind(...params, pageSize, st.page * pageSize).all<Row>();
  const columnPages = Math.max(1, Math.ceil(st.visible.length / 4));
  st.columnPage = Math.max(0, Math.min(st.columnPage, columnPages - 1));
  const visible = st.visible.slice(st.columnPage * 4, st.columnPage * 4 + 4);
  return buildTableMessage(s, meta, results, visible, pages, columnPages, count?.n ?? 0);
}
function editable(meta: Schema, mode: 'add' | 'edit') {
  return meta.columns.filter(c => !c.hidden && !(mode === 'edit' && c.pk) && !(mode === 'add' && meta.keys.length === 1 && c.pk && c.type.toUpperCase() === 'INTEGER'));
}
function form(s: Session, meta: Schema): APIInteractionResponse {
  const columns = editable(meta, s.state.draft!.mode).slice(s.state.draft!.step * 5, s.state.draft!.step * 5 + 5);
  assert(columns.length, 'This table has no editable columns.');
  return buildRowForm(s, meta, columns);
}
export function parseValue(text: string, c: Column): Value | undefined {
  if (!text) return undefined;
  if (text === 'NULL') { assert(!c.notnull && !c.pk, `${c.name} cannot be NULL.`); return null; }
  if (text === 'EMPTY') {
    assert(!/INT|REAL|FLOA|DOUB|BLOB/i.test(c.type), `${c.name} cannot be empty text.`);
    return '';
  }
  if (/INT|REAL|FLOA|DOUB/i.test(c.type)) {
    const number = Number(text);
    assert(text.trim() && Number.isFinite(number), `${c.name} must be a number.`);
    if (/INT/i.test(c.type)) assert(Number.isSafeInteger(number), `${c.name} must be a safe integer.`);
    return number;
  }
  assert(!/BLOB/i.test(c.type), `${c.name}: binary fields must be edited in the database editor.`);
  // Prefix a literal NULL or EMPTY with a backslash to store the word itself.
  return text.startsWith('\\') ? text.slice(1) : text;
}
function fields(raw: APIModalSubmitInteraction): Map<string, string | string[] | boolean> {
  const result = new Map<string, string | string[] | boolean>();
  for (const outer of raw.data.components) {
    const components = 'component' in outer ? [outer.component] : 'components' in outer ? outer.components : [outer];
    for (const c of components) {
      if ('custom_id' in c) {
        if ('values' in c) result.set(c.custom_id, c.values);
        else if ('value' in c) result.set(c.custom_id, c.value ?? '');
      }
    }
  }
  return result;
}
async function persist(env: Env, s: Session, previous: number, write?: D1PreparedStatement) {
  const save = env.SPARK_DB.prepare(`UPDATE ${sessionTable} SET state = ?, revision = ?, expires = ? WHERE id = ? AND revision = ?${write ? ' AND changes() = 1' : ''}`).bind(JSON.stringify(s.state), s.revision, Date.now() + ttl, s.id, previous);
  const results = await env.SPARK_DB.batch(write ? [write, save] : [save]);
  if (write) assert(results[0]?.meta.changes === 1, 'The row changed or was removed, or this control is stale. Reopen /database before editing it again.');
  assert(results[results.length - 1]?.meta.changes === 1, 'This control is stale. Use the latest message or reopen /database.');
}
function guard(s: Session, revision: number) {
  return { sql: `EXISTS (SELECT 1 FROM ${sessionTable} WHERE id = ? AND revision = ?)`, params: [s.id, revision] };
}
export async function openDatabase(raw: APIApplicationCommandInteraction, env: Env, table: string): Promise<APIInteractionResponse> {
  if (!authorized(raw, env)) return errorResponse('Only executives and the tech team can use /database.');
  try {
    const meta = await schema(env, table);
    await initialize(env);
    const s: Session = { id: crypto.randomUUID(), owner: userId(raw)!, guild: raw.guild_id!, revision: 0, state: { table, page: 0, visible: meta.columns.map(c => c.name), textPage: 0, columnPage: 0 } };
    const data = await render(env, s, meta);
    await env.SPARK_DB.prepare(`INSERT INTO ${sessionTable} VALUES (?, ?, ?, ?, ?, ?)`).bind(s.id, s.owner, s.guild, s.revision, Date.now() + ttl, JSON.stringify(s.state)).run();
    return initialResponse(data);
  } catch (error) { return failure(error); }
}
function failure(error: unknown): APIInteractionResponse {
  if (error instanceof InputError) return errorResponse(error.message);
  console.error('Database browser operation failed', error);
  return errorResponse('The database rejected this operation. Check required values, unique values, and referenced row IDs. Your draft is retained; retry or cancel.');
}
export async function databaseInteraction(raw: APIMessageComponentInteraction | APIModalSubmitInteraction, env: Env): Promise<APIInteractionResponse> {
  if (!authorized(raw, env)) return errorResponse('Only executives and the tech team can use /database.');
  try {
    const [, id, revisionText, action] = raw.data.custom_id.split(':');
    const record = await env.SPARK_DB.prepare(`SELECT * FROM ${sessionTable} WHERE id = ? AND expires > ?`).bind(id, Date.now()).first<{ id: string; owner: string; guild: string; revision: number; state: string }>();
    assert(record && record.owner === userId(raw) && record.guild === raw.guild_id, 'This session expired or belongs to someone else. Reopen /database.');
    assert(record.revision === Number(revisionText), 'This control is stale. Use the latest message or reopen /database.');
    const s: Session = { ...record, state: JSON.parse(record.state) };
    const meta = await schema(env, s.state.table);
    const previous = s.revision;
    const st = s.state;
    let write: D1PreparedStatement | undefined;
    if (raw.type === 3) {
      if (action === 'select') return buildSelectRowModal(s, meta);
      if (action === 'find') {
        assert(meta.columns.length <= 25, 'Find supports up to 25 columns per table.');
        return buildSearchModal(s, meta);
      }
      if (action === 'filter') {
        assert(meta.columns.length <= 50, 'Filter supports up to 50 columns per table.');
        return buildColumnFilterModal(s, meta);
      }
      if (action === 'add' || action === 'edit') {
        const row = action === 'edit' ? await getRow(env, s, meta) : undefined;
        st.draft = { mode: action, step: 0, values: row ? { ...row } : {}, original: row };
        const response = form(s, meta);
        await persist(env, s, previous);
        return response;
      }
      if (action === 'continue') return form(s, meta);
      if (action === 'delete') st.deleting = await getRow(env, s, meta);
      else if (action === 'confirm') {
        assert(st.deleting && st.focus, 'Open the deletion confirmation first.');
        const snapshot = predicate(Object.keys(st.deleting), Object.values(st.deleting));
        const g = guard(s, previous);
        write = env.SPARK_DB.prepare(`DELETE FROM ${quote(st.table)} WHERE ${snapshot.sql} AND ${g.sql}`).bind(...snapshot.params, ...g.params);
        delete st.deleting; delete st.focus;
      } else if (action === 'cancel') { delete st.draft; delete st.deleting; }
      else if (action === 'back') { delete st.focus; delete st.draft; delete st.deleting; }
      else if (action === 'prev') st.page--;
      else if (action === 'next') st.page++;
      else if (action === 'colPrev') st.columnPage--;
      else if (action === 'colNext') st.columnPage++;
      else if (action === 'textPrev') st.textPage--;
      else if (action === 'textNext') st.textPage++;
      else if (action === 'clear') { delete st.search; st.page = 0; }
      else if (action !== 'delete') throw new InputError('Unknown database action.');
    } else {
      const values = fields(raw);
      if (action === 'selected') {
        const value = String(values.get('key') ?? '');
        let key: Value[];
        try { key = meta.keys.length === 1 ? [value] : JSON.parse(value); } catch { throw new InputError('Enter the composite row key as a JSON array.'); }
        assert(Array.isArray(key) && key.every(v => v === null || typeof v === 'string' || typeof v === 'number'), 'Invalid row ID.');
        st.focus = key; st.textPage = 0;
        await getRow(env, s, meta);
      } else if (action === 'found') {
        const selected = values.get('column');
        const column = Array.isArray(selected) ? selected[0] : undefined;
        assert(column && meta.columns.some(c => c.name === column), 'Choose a valid column.');
        const value = String(values.get('value') ?? '');
        assert(value.length > 0, 'Enter a search value.');
        st.search = { column, value }; st.page = 0; delete st.focus;
        const { results } = await env.SPARK_DB.prepare(`SELECT ${meta.keys[0] === '_rowid_' ? '_rowid_, ' : ''}* FROM ${quote(st.table)} WHERE instr(lower(CAST(${quote(column)} AS TEXT)), lower(?)) > 0 LIMIT 2`).bind(value).all<Row>();
        if (results.length === 1) { st.focus = rowKey(results[0]!, meta); st.textPage = 0; }
      } else if (action === 'filtered') {
        st.visible = [];
        for (let i = 0; i < meta.columns.length; i += 10) {
          const selected = values.get(`columns${i}`);
          const group = meta.columns.slice(i, i + 10);
          st.visible.push(...group.filter(c => Array.isArray(selected) ? selected.includes(c.name) : selected === true).map(c => c.name));
        }
        st.columnPage = 0;
      } else if (action === 'save') {
        assert(st.draft, 'This draft is no longer available.');
        const draft = st.draft;
        const columns = editable(meta, draft.mode);
        for (const c of columns.slice(draft.step * 5, draft.step * 5 + 5)) {
          const value = parseValue(String(values.get(c.name) ?? ''), c);
          if (value !== undefined) draft.values[c.name] = value;
          else if (draft.mode === 'add') assert(!c.notnull || c.dflt_value !== null, `${c.name} is required.`);
        }
        draft.step++;
        if (draft.step * 5 >= columns.length) {
          const g = guard(s, previous);
          const entries = Object.entries(draft.values).filter(([name]) => columns.some(c => c.name === name));
          if (draft.mode === 'add') {
            assert(entries.length, 'Enter at least one value.');
            write = env.SPARK_DB.prepare(`INSERT INTO ${quote(st.table)} (${entries.map(([c]) => quote(c)).join(', ')}) SELECT ${entries.map(() => '?').join(', ')} WHERE ${g.sql}`).bind(...entries.map(([, v]) => v), ...g.params);
            delete st.focus;
          } else {
            assert(draft.original, 'Original row is missing.');
            const snapshot = predicate(Object.keys(draft.original), Object.values(draft.original));
            assert(entries.length, 'No editable values.');
            write = env.SPARK_DB.prepare(`UPDATE ${quote(st.table)} SET ${entries.map(([c]) => `${quote(c)} = ?`).join(', ')} WHERE ${snapshot.sql} AND ${g.sql}`).bind(...entries.map(([, v]) => v), ...snapshot.params, ...g.params);
          }
          delete st.draft;
        }
      } else throw new InputError('Unknown database form.');
    }
    s.revision++;
    // Render first for reads; write first for mutations so the refreshed view reflects the committed data.
    if (write) await persist(env, s, previous, write);
    const data = await render(env, s, meta);
    if (!write) await persist(env, s, previous);
    return updateResponse(data);
  } catch (error) { return failure(error); }
}
