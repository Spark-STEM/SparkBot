import type { APIApplicationCommandInteraction, APIApplicationCommandAutocompleteInteraction, APIMessageComponentInteraction, APIModalSubmitInteraction, APIInteractionResponse, APIActionRowComponent, APIButtonComponent, APIModalInteractionResponseCallbackComponent, APIInteractionResponseCallbackData } from 'discord-api-types/v10';
import { databaseTables } from '../generated/databaseSchema.ts';
import type { Env } from '../types.ts';

type Interaction = APIApplicationCommandInteraction | APIMessageComponentInteraction | APIModalSubmitInteraction;
type Value = string | number | null;
type Row = Record<string, Value>;
export interface Column { name: string; type: string; notnull: number; dflt_value: string | null; pk: number; hidden: number }
interface Schema { columns: Column[]; keys: string[] }
interface State {
  table: string; page: number; visible: string[]; search?: { column: string; value: string };
  focus?: Value[]; textPage: number; columnPage: number;
  draft?: { mode: 'add' | 'edit'; step: number; values: Row; original?: Row };
  deleting?: Row;
}
interface Session { id: string; owner: string; guild: string; revision: number; state: State }
const sessionTable = '_spark_database_sessions';
const pageSize = 8;
const ttl = 60 * 60 * 1000;
export const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
export function authorized(raw: Interaction | APIApplicationCommandAutocompleteInteraction, env: Env): boolean {
  return Boolean(raw.guild_id && raw.member?.roles.includes(env.EXECUTIVE_ROLE_ID || '1334030809577029713'));
}
const userId = (raw: Interaction) => (raw.member?.user ?? raw.user)?.id;
const errorResponse = (content: string): APIInteractionResponse => ({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] } } });
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
const customId = (s: Session, action: string) => `db:${s.id}:${s.revision}:${action}`;
function button(s: Session, action: string, label: string, disabled = false, style: 1 | 2 | 3 | 4 = 2): APIButtonComponent {
  return { type: 2, style, custom_id: customId(s, action), label, disabled };
}
const buttons = (...components: APIButtonComponent[]): APIActionRowComponent<APIButtonComponent> => ({ type: 1, components });
function message(s: Session, description: string, components: APIActionRowComponent<APIButtonComponent>[], footer = ''): APIInteractionResponseCallbackData {
  return { content: '', embeds: [{ title: s.state.table.slice(0, 256), description, color: 0x5865f2, ...(footer ? { footer: { text: footer.slice(0, 2048) } } : {}) }], components, allowed_mentions: { parse: [] } };
}
export function display(value: unknown): string {
  if (value === null) return 'NULL';
  return String(value).replaceAll('`', 'ˋ').replace(/[\r\n\t]/g, ' ').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
}
const shorten = (value: string, size: number) => value.length > size ? value.slice(0, size - 1) + '…' : value;
export function tableText(columns: string[], rows: Row[]): string {
  if (!columns.length) return 'All columns hidden. Use Filter to show columns.';
  const widths = columns.map(c => Math.min(24, Math.max(4, c.length, ...rows.map(r => display(r[c]).length))));
  const line = (values: string[]) => values.map((v, i) => shorten(v, widths[i]!).padEnd(widths[i]!)).join(' | ');
  return '```text\n' + [line(columns), widths.map(w => '-'.repeat(w)).join('-+-'), ...rows.map(r => line(columns.map(c => display(r[c]))))].join('\n') + '\n```';
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
export function fullRowChunks(row: Row, columns: string[]): string[] {
  const chunks: string[] = [];
  for (const column of columns) {
    const raw = row[column] === null ? 'NULL' : String(row[column] ?? '');
    const value = raw.replaceAll('`', 'ˋ');
    const prefix = `${column}\n${'-'.repeat(Math.min(column.length, 60))}\n`;
    const size = 3400 - prefix.length;
    for (let start = 0; start < Math.max(1, value.length); start += size) chunks.push('```text\n' + prefix + value.slice(start, start + size) + '\n```');
  }
  // Combine small columns into bounded pages.
  return chunks.reduce<string[]>((pages, chunk) => {
    if (pages.length && pages[pages.length - 1]!.length + chunk.length + 1 <= 3800) pages[pages.length - 1] += '\n' + chunk;
    else pages.push(chunk);
    return pages;
  }, []);
}
async function render(env: Env, s: Session, meta: Schema): Promise<APIInteractionResponseCallbackData> {
  const st = s.state;
  if (st.draft) return message(s, `**${st.draft.mode === 'add' ? 'Add' : 'Edit'} row — draft saved**\nContinue to step ${st.draft.step + 1}. No changes have been written yet.`, [buttons(button(s, 'continue', 'Continue', false, 1), button(s, 'cancel', 'Cancel'))]);
  if (st.deleting) return message(s, `**Delete this row permanently?**\nRow ID: ${display(JSON.stringify(st.focus))}\nThis cannot be undone. Related records may also be removed by database cascade rules.`, [buttons(button(s, 'confirm', 'Delete permanently', false, 4), button(s, 'cancel', 'Cancel'))]);
  if (st.focus) {
    const row = await getRow(env, s, meta);
    const chunks = fullRowChunks(row, meta.columns.map(c => c.name));
    st.textPage = Math.max(0, Math.min(st.textPage, chunks.length - 1));
    return message(s, chunks[st.textPage] || 'Empty row.', [buttons(button(s, 'back', 'Back'), button(s, 'edit', 'Edit', false, 1), button(s, 'delete', 'Delete', false, 4)), buttons(button(s, 'textPrev', 'Previous text', st.textPage === 0), button(s, 'textNext', 'Next text', st.textPage >= chunks.length - 1))], `Row ${JSON.stringify(st.focus)} • Text ${st.textPage + 1}/${chunks.length}`);
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
  const controls = [buttons(button(s, 'prev', 'Back', st.page === 0), button(s, 'select', 'Select', !results.length), button(s, 'next', 'Next', st.page >= pages - 1)), buttons(button(s, 'add', 'Add', false, 3), button(s, 'find', 'Find'), button(s, 'filter', 'Filter'))];
  if (columnPages > 1 || st.search) controls.push(buttons(button(s, 'colPrev', 'Previous columns', st.columnPage === 0), button(s, 'colNext', 'Next columns', st.columnPage >= columnPages - 1), button(s, 'clear', 'Clear search', !st.search)));
  return message(s, (results.length ? tableText(visible, results) : 'No matching rows.') + '\nSelect a row to read full values. Row IDs use ' + meta.keys.join(', ') + '.', controls, `Page ${st.page + 1}/${pages} • ${count?.n ?? 0} rows • Columns ${st.columnPage + 1}/${columnPages}${st.search ? ' • Search active' : ''}`);
}
function input(name: string, label: string, value = '', required = false, description = ''): APIModalInteractionResponseCallbackComponent {
  return { type: 18, label: label.slice(0, 45), ...(description ? { description: description.slice(0, 100) } : {}), component: { type: 4, custom_id: name, style: 2, required, max_length: 4000, ...(value ? { value } : {}) } };
}
function modal(s: Session, action: string, title: string, components: APIModalInteractionResponseCallbackComponent[]): APIInteractionResponse {
  return { type: 9, data: { custom_id: customId(s, action), title: title.slice(0, 45), components } };
}
function editable(meta: Schema, mode: 'add' | 'edit') {
  return meta.columns.filter(c => !c.hidden && !(mode === 'edit' && c.pk) && !(mode === 'add' && meta.keys.length === 1 && c.pk && c.type.toUpperCase() === 'INTEGER'));
}
function form(s: Session, meta: Schema): APIInteractionResponse {
  const draft = s.state.draft!;
  const columns = editable(meta, draft.mode).slice(draft.step * 5, draft.step * 5 + 5);
  assert(columns.length, 'This table has no editable columns.');
  return modal(s, 'save', `${draft.mode === 'add' ? 'Add' : 'Edit'}: step ${draft.step + 1}`, columns.map(c => {
    const value = draft.values[c.name];
    const original = value === null ? 'NULL' : value === undefined ? '' : value === '' ? 'EMPTY' : typeof value === 'string' && (value === 'NULL' || value === 'EMPTY' || value.startsWith('\\')) ? '\\' + value : String(value);
    return input(c.name, c.name, original.length <= 4000 ? original : '', Boolean(draft.mode === 'add' && c.notnull && c.dflt_value === null), `${c.type || 'value'}; NULL = null; EMPTY = empty text; blank = ${draft.mode === 'edit' ? 'unchanged' : 'default'}`);
  }));
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
  if (!authorized(raw, env)) return errorResponse('Only an executive can use /database.');
  try {
    const meta = await schema(env, table);
    await initialize(env);
    const s: Session = { id: crypto.randomUUID(), owner: userId(raw)!, guild: raw.guild_id!, revision: 0, state: { table, page: 0, visible: meta.columns.map(c => c.name), textPage: 0, columnPage: 0 } };
    const data = await render(env, s, meta);
    await env.SPARK_DB.prepare(`INSERT INTO ${sessionTable} VALUES (?, ?, ?, ?, ?, ?)`).bind(s.id, s.owner, s.guild, s.revision, Date.now() + ttl, JSON.stringify(s.state)).run();
    return { type: 4, data: { ...data, flags: 64 } };
  } catch (error) { return failure(error); }
}
function failure(error: unknown): APIInteractionResponse {
  if (error instanceof InputError) return errorResponse(error.message);
  console.error('Database browser operation failed', error);
  return errorResponse('The database rejected this operation. Check required values, unique values, and referenced row IDs. Your draft is retained; retry or cancel.');
}
export async function databaseInteraction(raw: APIMessageComponentInteraction | APIModalSubmitInteraction, env: Env): Promise<APIInteractionResponse> {
  if (!authorized(raw, env)) return errorResponse('Only an executive can use /database.');
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
      if (action === 'select') return modal(s, 'selected', 'Select row', [input('key', meta.keys.length === 1 ? `Row ID (${meta.keys[0]})` : 'Row key as JSON array', '', true)]);
      if (action === 'find') {
        assert(meta.columns.length <= 25, 'Find supports up to 25 columns per table.');
        return modal(s, 'found', 'Find rows', [{ type: 18, label: 'Column', component: { type: 3, custom_id: 'column', options: meta.columns.map(c => ({ label: c.name.slice(0, 100), value: c.name })), min_values: 1, max_values: 1 } }, input('value', 'Contains (case-insensitive)', '', true)]);
      }
      if (action === 'filter') {
        assert(meta.columns.length <= 50, 'Filter supports up to 50 columns per table.');
        const components: APIModalInteractionResponseCallbackComponent[] = [];
        for (let i = 0; i < meta.columns.length; i += 10) {
          const group = meta.columns.slice(i, i + 10);
          components.push({ type: 18, label: `Visible columns ${i + 1}–${i + group.length}`, component: group.length === 1 ? { type: 23, custom_id: `columns${i}`, default: st.visible.includes(group[0]!.name) } : { type: 22, custom_id: `columns${i}`, min_values: 0, max_values: group.length, required: false, options: group.map(c => ({ label: c.name.slice(0, 100), value: c.name, default: st.visible.includes(c.name) })) } });
        }
        return modal(s, 'filtered', 'Show / hide columns', components);
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
    return { type: 7, data };
  } catch (error) { return failure(error); }
}
