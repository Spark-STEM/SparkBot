import type { CommandInteraction } from '../discordBS/interactions/slash.ts';
import type { ComponentInteraction } from '../discordBS/interactions/component.ts';
import type { ModalInteraction } from '../discordBS/interactions/modal.ts';
import type { InteractionReply, ReplyOptions } from '../discordBS/interactions/reply.ts';
import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandAutocompleteInteraction,
  APIMessageComponentInteraction,
  APIModalSubmitInteraction,
} from 'discord-api-types/v10';
import { databaseTables } from '../generated/databaseSchema.ts';
import type { Env } from '../types.ts';
import { ButtonBuilder, ActionRowBuilder, ButtonStyle } from '../discordBS/builders/buttons.ts';
import { EmbedBuilder } from '../discordBS/builders/embed.ts';
import {
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
} from '../discordBS/builders/modals.ts';
import { StringSelectMenuBuilder } from '../discordBS/builders/select-menus.ts';
import type { Builder } from '../discordBS/builders/core.ts';
import { CheckboxBuilder, CheckboxGroupBuilder } from '../discordBS/builders/checkboxes.ts';
import type { SlashCommand } from './types.ts';

// Command definition

const command: SlashCommand = {
  name: 'database',
  description: 'Browse and manage database rows (executives and tech team)',
  type: 1,
  options: [
    {
      name: 'table',
      description: 'Table to browse',
      type: 3,
      required: true,
      async autocomplete(client, interaction) {
        const query = String(interaction.options.getFocused()).toLowerCase();
        await interaction.respond(
          authorized(interaction.raw, client.env)
            ? databaseTables
                .filter((name) => name.toLowerCase().includes(query))
                .slice(0, 25)
                .map((name) => ({ name, value: name }))
            : [],
        );
      },
    },
  ],
  async run(client, interaction) {
    await openDatabase(interaction, client.env, interaction.options.getString('table') ?? '');
  },
};
export default command;

// Browser state

export type Value = string | number | null;
export type Row = Record<string, Value>;
export interface Column {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
  hidden: number;
}
export interface Schema {
  columns: Column[];
  keys: string[];
}
export interface State {
  table: string;
  page: number;
  visible: string[];
  search?: { column: string; value: string };
  focus?: Value[];
  textPage: number;
  columnPage: number;
  draft?: { mode: 'add' | 'edit'; step: number; values: Row; original?: Row };
  deleting?: Row;
}
export interface Session {
  id: string;
  owner: string;
  guild: string;
  revision: number;
  state: State;
}

// Messages and modals

const customId = (session: Session, action: string) =>
  `db:${session.id}:${session.revision}:${action}`;
function button(
  session: Session,
  action: string,
  label: string,
  disabled = false,
  style: number = ButtonStyle.Secondary,
): ButtonBuilder {
  const routeId = customId(session, action);
  return new ButtonBuilder()
    .setStyle(style)
    .onClick(async (interaction: ComponentInteraction) => {
      await databaseInteraction(interaction, interaction.env, routeId);
    })
    .setLabel(label)
    .setDisabled(disabled);
}
const buttons = (...components: ButtonBuilder[]) =>
  new ActionRowBuilder().addComponents(...components);
function message(
  session: Session,
  description: string,
  components: ReturnType<typeof buttons>[],
  footer = '',
): ReplyOptions {
  const embed = new EmbedBuilder()
    .setTitle(session.state.table.slice(0, 256))
    .setDescription(description)
    .setColor(0x5865f2);
  if (footer) embed.setFooter({ text: footer.slice(0, 2048) });
  return { content: '', embeds: [embed], components, allowed_mentions: { parse: [] } };
}
export function display(value: unknown): string {
  if (value === null) return 'NULL';
  return String(value)
    .replaceAll('`', 'ˋ')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
}
const shorten = (value: string, size: number) =>
  value.length > size ? value.slice(0, size - 1) + '…' : value;
export function tableText(columns: string[], rows: Row[]): string {
  if (!columns.length) return 'All columns hidden. Use Filter to show columns.';
  const widths = columns.map((c) =>
    Math.min(24, Math.max(4, c.length, ...rows.map((r) => display(r[c]).length))),
  );
  const line = (values: string[]) =>
    values.map((v, i) => shorten(v, widths[i]!).padEnd(widths[i]!)).join(' | ');
  return (
    '```text\n' +
    [
      line(columns),
      widths.map((w) => '-'.repeat(w)).join('-+-'),
      ...rows.map((r) => line(columns.map((c) => display(r[c])))),
    ].join('\n') +
    '\n```'
  );
}

export function fullRowChunks(row: Row, columns: string[]): string[] {
  const chunks: string[] = [];
  for (const column of columns) {
    const raw = row[column] === null ? 'NULL' : String(row[column] ?? '');
    const value = raw.replaceAll('`', 'ˋ');
    const prefix = `${column}\n${'-'.repeat(Math.min(column.length, 60))}\n`;
    const size = 3400 - prefix.length;
    for (let start = 0; start < Math.max(1, value.length); start += size)
      chunks.push('```text\n' + prefix + value.slice(start, start + size) + '\n```');
  }
  // Combine small columns into bounded pages.
  return chunks.reduce<string[]>((pages, chunk) => {
    if (pages.length && pages[pages.length - 1]!.length + chunk.length + 1 <= 3800)
      pages[pages.length - 1] += '\n' + chunk;
    else pages.push(chunk);
    return pages;
  }, []);
}

function input(
  name: string,
  label: string,
  value = '',
  required = false,
  description = '',
): LabelBuilder {
  const text = new TextInputBuilder()
    .setCustomId(name)
    .setStyle(TextInputStyle.Paragraph)
    .setLabel(label.slice(0, 45))
    .setRequired(required)
    .setMaxLength(4000);
  if (value) text.setValue(value);
  const builder = new LabelBuilder().setLabel(label.slice(0, 45)).setTextInputComponent(text);
  if (description) builder.setDescription(description.slice(0, 100));
  return builder;
}
function modal(session: Session, action: string, title: string, components: Builder[]) {
  const routeId = customId(session, action);
  return new ModalBuilder()
    .onSubmit(async (interaction: ModalInteraction) => {
      await databaseInteraction(interaction, interaction.env, routeId);
    })
    .setTitle(title.slice(0, 45))
    .addComponents(...components);
}
function formatDraftValue(value: Row[string] | undefined): string {
  if (value === null) return 'NULL';
  if (value === undefined) return '';
  if (value === '') return 'EMPTY';

  const needsEscape =
    typeof value === 'string' && (value === 'NULL' || value === 'EMPTY' || value.startsWith('\\'));
  return needsEscape ? '\\' + value : String(value);
}

export function buildRowForm(session: Session, meta: Schema, columns: Schema['columns']) {
  const draft = session.state.draft!;
  return modal(
    session,
    'save',
    `${draft.mode === 'add' ? 'Add' : 'Edit'}: step ${draft.step + 1}`,
    columns.map((c) => {
      const value = draft.values[c.name];
      const original = formatDraftValue(value);
      const initialValue = original.length <= 4000 ? original : '';
      const required = Boolean(draft.mode === 'add' && c.notnull && c.dflt_value === null);
      const blankMeaning = draft.mode === 'edit' ? 'unchanged' : 'default';
      const description = `${c.type || 'value'}; NULL = null; EMPTY = empty text; blank = ${blankMeaning}`;
      return input(c.name, c.name, initialValue, required, description);
    }),
  );
}

export function buildTableMessage(
  session: Session,
  meta: Schema,
  results: Row[],
  visible: string[],
  pages: number,
  columnPages: number,
  count: number,
) {
  const state = session.state;
  const controls = [
    buttons(
      button(session, 'prev', 'Back', state.page === 0),
      button(session, 'select', 'Select', !results.length),
      button(session, 'next', 'Next', state.page >= pages - 1),
    ),
    buttons(
      button(session, 'add', 'Add', false, ButtonStyle.Success),
      button(session, 'find', 'Find'),
      button(session, 'filter', 'Filter'),
    ),
  ];
  if (columnPages > 1 || state.search)
    controls.push(
      buttons(
        button(session, 'colPrev', 'Previous columns', state.columnPage === 0),
        button(session, 'colNext', 'Next columns', state.columnPage >= columnPages - 1),
        button(session, 'clear', 'Clear search', !state.search),
      ),
    );
  return message(
    session,
    (results.length ? tableText(visible, results) : 'No matching rows.') +
      '\nSelect a row to read full values. Row IDs use ' +
      meta.keys.join(', ') +
      '.',
    controls,
    `Page ${state.page + 1}/${pages} • ${count} rows • Columns ${state.columnPage + 1}/${columnPages}${state.search ? ' • Search active' : ''}`,
  );
}

export function buildDraftMessage(session: Session) {
  const draft = session.state.draft!;
  return message(
    session,
    `**${draft.mode === 'add' ? 'Add' : 'Edit'} row — draft saved**\nContinue to step ${draft.step + 1}. No changes have been written yet.`,
    [
      buttons(
        button(session, 'continue', 'Continue', false, ButtonStyle.Primary),
        button(session, 'cancel', 'Cancel'),
      ),
    ],
  );
}
export function buildDeleteMessage(session: Session) {
  return message(
    session,
    `**Delete this row permanently?**\nRow ID: ${display(JSON.stringify(session.state.focus))}\nThis cannot be undone. Related records may also be removed by database cascade rules.`,
    [
      buttons(
        button(session, 'confirm', 'Delete permanently', false, ButtonStyle.Danger),
        button(session, 'cancel', 'Cancel'),
      ),
    ],
  );
}
export function buildRowMessage(session: Session, row: Row, meta: Schema) {
  const state = session.state;
  const chunks = fullRowChunks(
    row,
    meta.columns.map((c) => c.name),
  );
  state.textPage = Math.max(0, Math.min(state.textPage, chunks.length - 1));
  return message(
    session,
    chunks[state.textPage] || 'Empty row.',
    [
      buttons(
        button(session, 'back', 'Back'),
        button(session, 'edit', 'Edit', false, ButtonStyle.Primary),
        button(session, 'delete', 'Delete', false, ButtonStyle.Danger),
      ),
      buttons(
        button(session, 'textPrev', 'Previous text', state.textPage === 0),
        button(session, 'textNext', 'Next text', state.textPage >= chunks.length - 1),
      ),
    ],
    `Row ${JSON.stringify(state.focus)} • Text ${state.textPage + 1}/${chunks.length}`,
  );
}
export function buildSelectRowModal(session: Session, meta: Schema) {
  return modal(session, 'selected', 'Select row', [
    input(
      'key',
      meta.keys.length === 1 ? `Row ID (${meta.keys[0]})` : 'Row key as JSON array',
      '',
      true,
    ),
  ]);
}
export function buildSearchModal(session: Session, meta: Schema) {
  const select = new StringSelectMenuBuilder()
    .setCustomId('column')
    .addOptions(...meta.columns.map((c) => ({ label: c.name.slice(0, 100), value: c.name })))
    .setMinValues(1)
    .setMaxValues(1);
  return modal(session, 'found', 'Find rows', [
    new LabelBuilder().setLabel('Column').setTextInputComponent(select),
    input('value', 'Contains (case-insensitive)', '', true),
  ]);
}
export function buildColumnFilterModal(session: Session, meta: Schema) {
  const components: Builder[] = [];
  for (let i = 0; i < meta.columns.length; i += 10) {
    const group = meta.columns.slice(i, i + 10);
    const control =
      group.length === 1
        ? new CheckboxBuilder()
            .setCustomId(`columns${i}`)
            .setDefault(session.state.visible.includes(group[0]!.name))
        : new CheckboxGroupBuilder()
            .setCustomId(`columns${i}`)
            .setMinValues(0)
            .setMaxValues(group.length)
            .setRequired(false)
            .addOptions(
              ...group.map((c) => ({
                label: c.name.slice(0, 100),
                value: c.name,
                default: session.state.visible.includes(c.name),
              })),
            );
    components.push(
      new LabelBuilder()
        .setLabel(`Visible columns ${i + 1}–${i + group.length}`)
        .setTextInputComponent(control),
    );
  }
  return modal(session, 'filtered', 'Show / hide columns', components);
}

// Database operations and interaction handling

type Interaction =
  APIApplicationCommandInteraction | APIMessageComponentInteraction | APIModalSubmitInteraction;
const sessionTable = '_spark_database_sessions';
const pageSize = 8;
const ttl = 60 * 60 * 1000;
export const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
export function authorized(
  raw: Interaction | APIApplicationCommandAutocompleteInteraction,
  env: Env,
): boolean {
  const allowedRoles = [
    env.EXECUTIVE_ROLE_ID || '1334030809577029713',
    env.TECH_ROLE_ID || '1546728101772529674',
  ];
  return Boolean(raw.guild_id && raw.member?.roles.some((role) => allowedRoles.includes(role)));
}
const userId = (raw: Interaction) => (raw.member?.user ?? raw.user)?.id;
class InputError extends Error {}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new InputError(message);
}

async function schema(env: Env, table: string): Promise<Schema> {
  assert(
    (databaseTables as readonly string[]).includes(table),
    'Choose a table from autocomplete.',
  );
  const { results: columns } = await env.SPARK_DB.prepare(
    `PRAGMA table_xinfo(${quote(table)})`,
  ).all<Column>();
  assert(columns.length, 'This table no longer exists. Regenerate the schema.');
  const keys = columns
    .filter((c) => c.pk)
    .sort((a, b) => a.pk - b.pk)
    .map((c) => c.name);
  // SQLite rowid is available for ordinary tables without a declared primary key.
  if (!keys.length) {
    assert(
      !columns.some((c) => ['rowid', '_rowid_', 'oid'].includes(c.name.toLowerCase())),
      'This table has no usable row identifier.',
    );
    keys.push('_rowid_');
  }
  return { columns, keys };
}
async function initialize(env: Env) {
  await env.SPARK_DB.prepare(
    `CREATE TABLE IF NOT EXISTS ${sessionTable} (id TEXT PRIMARY KEY, owner TEXT NOT NULL, guild TEXT NOT NULL, revision INTEGER NOT NULL, expires INTEGER NOT NULL, state TEXT NOT NULL)`,
  ).run();
  await env.SPARK_DB.prepare(`DELETE FROM ${sessionTable} WHERE expires < ?`)
    .bind(Date.now())
    .run();
}
function predicate(keys: string[], values: Value[]) {
  assert(values.length === keys.length, 'Invalid row identifier.');
  return { sql: keys.map((k) => `${quote(k)} IS ?`).join(' AND '), params: values };
}
function rowKey(row: Row, meta: Schema) {
  return meta.keys.map((k) => row[k] ?? null);
}
async function getRow(env: Env, s: Session, meta: Schema): Promise<Row> {
  assert(s.state.focus, 'Select a row first.');
  const where = predicate(meta.keys, s.state.focus);
  const row = await env.SPARK_DB.prepare(
    `SELECT ${meta.keys[0] === '_rowid_' ? '_rowid_, ' : ''}* FROM ${quote(s.state.table)} WHERE ${where.sql}`,
  )
    .bind(...where.params)
    .first<Row>();
  assert(row, 'This row no longer exists. Use Back to return to the table.');
  return row;
}
async function render(env: Env, s: Session, meta: Schema): Promise<ReplyOptions> {
  const st = s.state;
  if (st.draft) return buildDraftMessage(s);
  if (st.deleting) return buildDeleteMessage(s);
  if (st.focus) {
    const row = await getRow(env, s, meta);
    return buildRowMessage(s, row, meta);
  }
  const filter = st.search
    ? ` WHERE instr(lower(CAST(${quote(st.search.column)} AS TEXT)), lower(?)) > 0`
    : '';
  const params = st.search ? [st.search.value] : [];
  const count = await env.SPARK_DB.prepare(`SELECT count(*) AS n FROM ${quote(st.table)}${filter}`)
    .bind(...params)
    .first<{ n: number }>();
  const pages = Math.max(1, Math.ceil((count?.n ?? 0) / pageSize));
  st.page = Math.max(0, Math.min(st.page, pages - 1));
  const { results } = await env.SPARK_DB.prepare(
    `SELECT ${meta.keys[0] === '_rowid_' ? '_rowid_, ' : ''}* FROM ${quote(st.table)}${filter} ORDER BY ${meta.keys.map(quote).join(', ')} LIMIT ? OFFSET ?`,
  )
    .bind(...params, pageSize, st.page * pageSize)
    .all<Row>();
  const columnPages = Math.max(1, Math.ceil(st.visible.length / 4));
  st.columnPage = Math.max(0, Math.min(st.columnPage, columnPages - 1));
  const visible = st.visible.slice(st.columnPage * 4, st.columnPage * 4 + 4);
  return buildTableMessage(s, meta, results, visible, pages, columnPages, count?.n ?? 0);
}
function editable(meta: Schema, mode: 'add' | 'edit') {
  return meta.columns.filter(
    (c) =>
      !c.hidden &&
      !(mode === 'edit' && c.pk) &&
      !(mode === 'add' && meta.keys.length === 1 && c.pk && c.type.toUpperCase() === 'INTEGER'),
  );
}
function form(s: Session, meta: Schema) {
  const columns = editable(meta, s.state.draft!.mode).slice(
    s.state.draft!.step * 5,
    s.state.draft!.step * 5 + 5,
  );
  assert(columns.length, 'This table has no editable columns.');
  return buildRowForm(s, meta, columns);
}
export function parseValue(text: string, c: Column): Value | undefined {
  if (!text) return undefined;
  if (text === 'NULL') {
    assert(!c.notnull && !c.pk, `${c.name} cannot be NULL.`);
    return null;
  }
  if (text === 'EMPTY') {
    assert(!/INT|REAL|FLOA|DOUB|BLOB/i.test(c.type), `${c.name} cannot be empty text.`);
    return '';
  }
  if (/INT|REAL|FLOA|DOUB/i.test(c.type)) {
    const number = Number(text);
    assert(text.trim() && Number.isFinite(number), `${c.name} must be a number.`);
    if (/INT/i.test(c.type))
      assert(Number.isSafeInteger(number), `${c.name} must be a safe integer.`);
    return number;
  }
  assert(!/BLOB/i.test(c.type), `${c.name}: binary fields must be edited in the database editor.`);
  // Prefix a literal NULL or EMPTY with a backslash to store the word itself.
  return text.startsWith('\\') ? text.slice(1) : text;
}
async function persist(env: Env, s: Session, previous: number, write?: D1PreparedStatement) {
  const save = env.SPARK_DB.prepare(
    `UPDATE ${sessionTable} SET state = ?, revision = ?, expires = ? WHERE id = ? AND revision = ?${write ? ' AND changes() = 1' : ''}`,
  ).bind(JSON.stringify(s.state), s.revision, Date.now() + ttl, s.id, previous);
  const results = await env.SPARK_DB.batch(write ? [write, save] : [save]);
  if (write)
    assert(
      results[0]?.meta.changes === 1,
      'The row changed or was removed, or this control is stale. Reopen /database before editing it again.',
    );
  assert(
    results[results.length - 1]?.meta.changes === 1,
    'This control is stale. Use the latest message or reopen /database.',
  );
}
function guard(s: Session, revision: number) {
  return {
    sql: `EXISTS (SELECT 1 FROM ${sessionTable} WHERE id = ? AND revision = ?)`,
    params: [s.id, revision],
  };
}
export async function openDatabase(interaction: CommandInteraction, env: Env, table: string) {
  const raw = interaction.raw;
  if (!authorized(raw, env))
    return interaction.reply({
      content: 'Only executives and the tech team can use /database.',
      ephemeral: true,
    });
  try {
    const meta = await schema(env, table);
    await initialize(env);
    const s: Session = {
      id: crypto.randomUUID(),
      owner: userId(raw)!,
      guild: raw.guild_id!,
      revision: 0,
      state: {
        table,
        page: 0,
        visible: meta.columns.map((c) => c.name),
        textPage: 0,
        columnPage: 0,
      },
    };
    const data = await render(env, s, meta);
    await env.SPARK_DB.prepare(`INSERT INTO ${sessionTable} VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(s.id, s.owner, s.guild, s.revision, Date.now() + ttl, JSON.stringify(s.state))
      .run();
    return interaction.reply({ ...data, ephemeral: true });
  } catch (error) {
    return failure(interaction, error);
  }
}
function failure(interaction: InteractionReply, error: unknown) {
  const reply = (content: string) =>
    interaction.reply({ content, ephemeral: true, allowed_mentions: { parse: [] } });
  if (error instanceof InputError) return reply(error.message);
  console.error('Database browser operation failed', error);
  return reply(
    'The database rejected this operation. Check required values, unique values, and referenced row IDs. Your draft is retained; retry or cancel.',
  );
}
export async function databaseInteraction(
  interaction: ComponentInteraction | ModalInteraction,
  env: Env,
  routeId: string,
) {
  const raw = interaction.raw;
  if (!authorized(raw, env))
    return interaction.reply({
      content: 'Only executives and the tech team can use /database.',
      ephemeral: true,
    });
  try {
    const [, id, revisionText, action] = routeId.split(':');
    const record = await env.SPARK_DB.prepare(
      `SELECT * FROM ${sessionTable} WHERE id = ? AND expires > ?`,
    )
      .bind(id, Date.now())
      .first<{ id: string; owner: string; guild: string; revision: number; state: string }>();
    assert(
      record && record.owner === userId(raw) && record.guild === raw.guild_id,
      'This session expired or belongs to someone else. Reopen /database.',
    );
    assert(
      record.revision === Number(revisionText),
      'This control is stale. Use the latest message or reopen /database.',
    );
    const s: Session = { ...record, state: JSON.parse(record.state) };
    const meta = await schema(env, s.state.table);
    const previous = s.revision;
    const st = s.state;
    let write: D1PreparedStatement | undefined;
    if (raw.type === 3) {
      if (action === 'select') return interaction.showModal(buildSelectRowModal(s, meta));
      if (action === 'find') {
        assert(meta.columns.length <= 25, 'Find supports up to 25 columns per table.');
        return interaction.showModal(buildSearchModal(s, meta));
      }
      if (action === 'filter') {
        assert(meta.columns.length <= 50, 'Filter supports up to 50 columns per table.');
        return interaction.showModal(buildColumnFilterModal(s, meta));
      }
      if (action === 'add' || action === 'edit') {
        const row = action === 'edit' ? await getRow(env, s, meta) : undefined;
        st.draft = { mode: action, step: 0, values: row ? { ...row } : {}, original: row };
        const response = form(s, meta);
        await persist(env, s, previous);
        return interaction.showModal(response);
      }
      if (action === 'continue') return interaction.showModal(form(s, meta));
      if (action === 'delete') st.deleting = await getRow(env, s, meta);
      else if (action === 'confirm') {
        assert(st.deleting && st.focus, 'Open the deletion confirmation first.');
        const snapshot = predicate(Object.keys(st.deleting), Object.values(st.deleting));
        const g = guard(s, previous);
        write = env.SPARK_DB.prepare(
          `DELETE FROM ${quote(st.table)} WHERE ${snapshot.sql} AND ${g.sql}`,
        ).bind(...snapshot.params, ...g.params);
        delete st.deleting;
        delete st.focus;
      } else if (action === 'cancel') {
        delete st.draft;
        delete st.deleting;
      } else if (action === 'back') {
        delete st.focus;
        delete st.draft;
        delete st.deleting;
      } else if (action === 'prev') st.page--;
      else if (action === 'next') st.page++;
      else if (action === 'colPrev') st.columnPage--;
      else if (action === 'colNext') st.columnPage++;
      else if (action === 'textPrev') st.textPage--;
      else if (action === 'textNext') st.textPage++;
      else if (action === 'clear') {
        delete st.search;
        st.page = 0;
      } else if (action !== 'delete') throw new InputError('Unknown database action.');
    } else {
      const values = (interaction as ModalInteraction).fields;
      if (action === 'selected') {
        const value = values.getTextInputValue('key') ?? '';
        let key: Value[];
        try {
          key = meta.keys.length === 1 ? [value] : JSON.parse(value);
        } catch {
          throw new InputError('Enter the composite row key as a JSON array.');
        }
        assert(
          Array.isArray(key) &&
            key.every((v) => v === null || typeof v === 'string' || typeof v === 'number'),
          'Invalid row ID.',
        );
        st.focus = key;
        st.textPage = 0;
        await getRow(env, s, meta);
      } else if (action === 'found') {
        const column = values.getSelectedValues('column')[0];
        assert(column && meta.columns.some((c) => c.name === column), 'Choose a valid column.');
        const value = values.getTextInputValue('value') ?? '';
        assert(value.length > 0, 'Enter a search value.');
        st.search = { column, value };
        st.page = 0;
        delete st.focus;
        const { results } = await env.SPARK_DB.prepare(
          `SELECT ${meta.keys[0] === '_rowid_' ? '_rowid_, ' : ''}* FROM ${quote(st.table)} WHERE instr(lower(CAST(${quote(column)} AS TEXT)), lower(?)) > 0 LIMIT 2`,
        )
          .bind(value)
          .all<Row>();
        if (results.length === 1) {
          st.focus = rowKey(results[0]!, meta);
          st.textPage = 0;
        }
      } else if (action === 'filtered') {
        st.visible = [];
        for (let i = 0; i < meta.columns.length; i += 10) {
          const selected = values.getSelectedValues(`columns${i}`);
          const group = meta.columns.slice(i, i + 10);
          st.visible.push(
            ...group
              .filter((c) =>
                group.length === 1
                  ? values.getCheckboxValue(`columns${i}`)
                  : selected.includes(c.name),
              )
              .map((c) => c.name),
          );
        }
        st.columnPage = 0;
      } else if (action === 'save') {
        assert(st.draft, 'This draft is no longer available.');
        const draft = st.draft;
        const columns = editable(meta, draft.mode);
        for (const c of columns.slice(draft.step * 5, draft.step * 5 + 5)) {
          const value = parseValue(values.getTextInputValue(c.name) ?? '', c);
          if (value !== undefined) draft.values[c.name] = value;
          else if (draft.mode === 'add')
            assert(!c.notnull || c.dflt_value !== null, `${c.name} is required.`);
        }
        draft.step++;
        if (draft.step * 5 >= columns.length) {
          const g = guard(s, previous);
          const entries = Object.entries(draft.values).filter(([name]) =>
            columns.some((c) => c.name === name),
          );
          if (draft.mode === 'add') {
            assert(entries.length, 'Enter at least one value.');
            write = env.SPARK_DB.prepare(
              `INSERT INTO ${quote(st.table)} (${entries.map(([c]) => quote(c)).join(', ')}) SELECT ${entries.map(() => '?').join(', ')} WHERE ${g.sql}`,
            ).bind(...entries.map(([, v]) => v), ...g.params);
            delete st.focus;
          } else {
            assert(draft.original, 'Original row is missing.');
            const snapshot = predicate(Object.keys(draft.original), Object.values(draft.original));
            assert(entries.length, 'No editable values.');
            write = env.SPARK_DB.prepare(
              `UPDATE ${quote(st.table)} SET ${entries.map(([c]) => `${quote(c)} = ?`).join(', ')} WHERE ${snapshot.sql} AND ${g.sql}`,
            ).bind(...entries.map(([, v]) => v), ...snapshot.params, ...g.params);
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
    return interaction.update(data);
  } catch (error) {
    return failure(interaction, error);
  }
}
