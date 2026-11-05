export type Value = string | number | null;
export type Row = Record<string, Value>;
export interface Column { name: string; type: string; notnull: number; dflt_value: string | null; pk: number; hidden: number }
export interface Schema { columns: Column[]; keys: string[] }
export interface State {
  table: string; page: number; visible: string[]; search?: { column: string; value: string };
  focus?: Value[]; textPage: number; columnPage: number;
  draft?: { mode: 'add' | 'edit'; step: number; values: Row; original?: Row };
  deleting?: Row;
}
export interface Session { id: string; owner: string; guild: string; revision: number; state: State }
