import type { APIInteractionResponse, APIActionRowComponent, APIButtonComponent, APIInteractionResponseCallbackData } from 'discord-api-types/v10';
import { ButtonBuilder, ActionRowBuilder } from '../discordBS/builders/buttons.ts';
import { EmbedBuilder } from '../discordBS/builders/embed.ts';
import { ModalBuilder, LabelBuilder, TextInputBuilder } from '../discordBS/builders/modals.ts';
import { StringSelectMenuBuilder } from '../discordBS/builders/select-menus.ts';
import type { Builder } from '../discordBS/builders/core.ts';
import { CheckboxBuilder, CheckboxGroupBuilder } from '../discordBS/builders/checkboxes.ts';
import type { Row, Schema, Session } from './database-browser-types.ts';
const customId = (s: Session, action: string) => `db:${s.id}:${s.revision}:${action}`;
function button(s: Session, action: string, label: string, disabled = false, style: 1 | 2 | 3 | 4 = 2): ButtonBuilder {
  return new ButtonBuilder().setStyle(style).setCustomId(customId(s, action)).setLabel(label).setDisabled(disabled);
}
const buttons = (...components: ButtonBuilder[]) => new ActionRowBuilder().addComponents(...components);
function message(s: Session, description: string, components: ReturnType<typeof buttons>[], footer = ''): APIInteractionResponseCallbackData {
  const embed = new EmbedBuilder().setTitle(s.state.table.slice(0, 256)).setDescription(description).setColor(0x5865f2);
  if (footer) embed.setFooter({ text: footer.slice(0, 2048) });
  return { content: '', embeds: [embed.toJSON()], components: components.map(row => row.toJSON() as Record<string, unknown> & APIActionRowComponent<APIButtonComponent>), allowed_mentions: { parse: [] } };
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

function input(name: string, label: string, value = '', required = false, description = ''): LabelBuilder {
  const text = new TextInputBuilder().setCustomId(name).setStyle(2).setLabel(label.slice(0, 45)).setRequired(required).setMaxLength(4000);
  if (value) text.setValue(value);
  // Labels contain the display text; their nested input does not carry a label.
  const { label: _label, ...component } = text.toJSON();
  const builder = new LabelBuilder().setLabel(label.slice(0, 45)).setTextInputComponent({ toJSON: () => component });
  if (description) builder.setDescription(description.slice(0, 100));
  return builder;
}
function modal(s: Session, action: string, title: string, components: Builder[]): APIInteractionResponse {
  const data = new ModalBuilder().setCustomId(customId(s, action)).setTitle(title.slice(0, 45)).addComponents(...components).toJSON();
  return { type: 9, data: data as Record<string, unknown> & Extract<APIInteractionResponse, { type: 9 }>['data'] };
}
export function buildRowForm(s: Session, meta: Schema, columns: Schema['columns']): APIInteractionResponse {
  const draft = s.state.draft!;
  return modal(s, 'save', `${draft.mode === 'add' ? 'Add' : 'Edit'}: step ${draft.step + 1}`, columns.map(c => {
    const value = draft.values[c.name];
    const original = value === null ? 'NULL' : value === undefined ? '' : value === '' ? 'EMPTY' : typeof value === 'string' && (value === 'NULL' || value === 'EMPTY' || value.startsWith('\\')) ? '\\' + value : String(value);
    return input(c.name, c.name, original.length <= 4000 ? original : '', Boolean(draft.mode === 'add' && c.notnull && c.dflt_value === null), `${c.type || 'value'}; NULL = null; EMPTY = empty text; blank = ${draft.mode === 'edit' ? 'unchanged' : 'default'}`);
  }));
}

export function buildTableMessage(s: Session, meta: Schema, results: Row[], visible: string[], pages: number, columnPages: number, count: number) {
  const st = s.state;
  const controls = [buttons(button(s, 'prev', 'Back', st.page === 0), button(s, 'select', 'Select', !results.length), button(s, 'next', 'Next', st.page >= pages - 1)), buttons(button(s, 'add', 'Add', false, 3), button(s, 'find', 'Find'), button(s, 'filter', 'Filter'))];
  if (columnPages > 1 || st.search) controls.push(buttons(button(s, 'colPrev', 'Previous columns', st.columnPage === 0), button(s, 'colNext', 'Next columns', st.columnPage >= columnPages - 1), button(s, 'clear', 'Clear search', !st.search)));
  return message(s, (results.length ? tableText(visible, results) : 'No matching rows.') + '\nSelect a row to read full values. Row IDs use ' + meta.keys.join(', ') + '.', controls, `Page ${st.page + 1}/${pages} • ${count} rows • Columns ${st.columnPage + 1}/${columnPages}${st.search ? ' • Search active' : ''}`);
}

export function buildDraftMessage(s: Session) {
  const draft = s.state.draft!;
  return message(s, `**${draft.mode === 'add' ? 'Add' : 'Edit'} row — draft saved**\nContinue to step ${draft.step + 1}. No changes have been written yet.`, [buttons(button(s, 'continue', 'Continue', false, 1), button(s, 'cancel', 'Cancel'))]);
}
export function buildDeleteMessage(s: Session) {
  return message(s, `**Delete this row permanently?**\nRow ID: ${display(JSON.stringify(s.state.focus))}\nThis cannot be undone. Related records may also be removed by database cascade rules.`, [buttons(button(s, 'confirm', 'Delete permanently', false, 4), button(s, 'cancel', 'Cancel'))]);
}
export function buildRowMessage(s: Session, row: Row, meta: Schema) {
  const st = s.state;
  const chunks = fullRowChunks(row, meta.columns.map(c => c.name));
  st.textPage = Math.max(0, Math.min(st.textPage, chunks.length - 1));
  return message(s, chunks[st.textPage] || 'Empty row.', [buttons(button(s, 'back', 'Back'), button(s, 'edit', 'Edit', false, 1), button(s, 'delete', 'Delete', false, 4)), buttons(button(s, 'textPrev', 'Previous text', st.textPage === 0), button(s, 'textNext', 'Next text', st.textPage >= chunks.length - 1))], `Row ${JSON.stringify(st.focus)} • Text ${st.textPage + 1}/${chunks.length}`);
}
export function buildSelectRowModal(s: Session, meta: Schema) {
  return modal(s, 'selected', 'Select row', [input('key', meta.keys.length === 1 ? `Row ID (${meta.keys[0]})` : 'Row key as JSON array', '', true)]);
}
export function buildSearchModal(s: Session, meta: Schema) {
  const select = new StringSelectMenuBuilder().setCustomId('column')
    .addOptions(...meta.columns.map(c => ({ label: c.name.slice(0, 100), value: c.name })))
    .setMinValues(1).setMaxValues(1);
  return modal(s, 'found', 'Find rows', [new LabelBuilder().setLabel('Column').setTextInputComponent(select), input('value', 'Contains (case-insensitive)', '', true)]);
}
export function buildColumnFilterModal(s: Session, meta: Schema) {
  const components: Builder[] = [];
  for (let i = 0; i < meta.columns.length; i += 10) {
    const group = meta.columns.slice(i, i + 10);
    const control = group.length === 1
      ? new CheckboxBuilder().setCustomId(`columns${i}`).setDefault(s.state.visible.includes(group[0]!.name))
      : new CheckboxGroupBuilder().setCustomId(`columns${i}`).setMinValues(0).setMaxValues(group.length).setRequired(false)
        .addOptions(...group.map(c => ({ label: c.name.slice(0, 100), value: c.name, default: s.state.visible.includes(c.name) })));
    components.push(new LabelBuilder().setLabel(`Visible columns ${i + 1}–${i + group.length}`).setTextInputComponent(control));
  }
  return modal(s, 'filtered', 'Show / hide columns', components);
}
export const errorResponse = (content: string): APIInteractionResponse => ({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] } } });
export const initialResponse = (data: APIInteractionResponseCallbackData): APIInteractionResponse => ({ type: 4, data: { ...data, flags: 64 } });
export const updateResponse = (data: APIInteractionResponseCallbackData): APIInteractionResponse => ({ type: 7, data });
