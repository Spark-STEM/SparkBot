export type SqlValue = string | number | boolean | null | ArrayBuffer | ArrayBufferView;
type Row = Record<string, any>;

/** Row types for the application's tables, used to infer `select()` results. */
export interface TableRows {
  chapters: { id: number; country: string; region: string | null; city: string; name: string | null };
  roles: { id: number; name: string; description: string | null };
  schools: { id: number; chapter_id: number | null; name: string; link: string | null; cover_image: string | null };
  programs: { id: number; school_id: number | null; name: string; description: string | null; status: string };
  members: { id: number; chapter_id: number | null; name: string; email: string | null; hours: number; discord_id: string | null };
}

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;

function quoteIdentifier(value: string): string {
  if (!identifier.test(value)) throw new Error(`Invalid SQL identifier: ${value}`);
  return `"${value}"`;
}

function values(columns: string[], record: Record<string, SqlValue>): SqlValue[] {
  return columns.map((column) => record[column] ?? null);
}

/** A parameterized SQL statement that can be composed before execution. */
export interface Statement<T extends Row = any> {
  /** SQL text with `?` placeholders. */
  sql: string;
  /** Values bound to the statement placeholders. */
  params: SqlValue[];
  /** Executes the statement and returns all rows. */
  all(): Promise<T[]>;
  /** Executes the statement and returns the first row, if present. */
  first(): Promise<T | null>;
  /** Executes an INSERT, UPDATE, or DELETE statement. */
  run(): Promise<D1Result<unknown>>;
}

class PreparedStatement<T extends Row> implements Statement<T> {
  constructor(
    private readonly db: D1Database,
    readonly sql: string,
    readonly params: SqlValue[] = [],
  ) {}

  /** Executes the statement and returns all rows. */
  async all(): Promise<T[]> {
    const result = await this.db.prepare(this.sql).bind(...this.params).all<T>();
    return result.results;
  }

  /** Executes the statement and returns the first row, if present. */
  async first(): Promise<T | null> {
    return this.db.prepare(this.sql).bind(...this.params).first<T>();
  }

  /** Executes an INSERT, UPDATE, or DELETE statement. */
  run(): Promise<D1Result<unknown>> {
    return this.db.prepare(this.sql).bind(...this.params).run();
  }
}

/** A small, parameterized D1 interface for common CRUD operations. */
export class Database {
  constructor(private readonly db: D1Database) {}

  private where(where: Record<string, SqlValue>): { sql: string; params: SqlValue[] } {
    const filters = Object.entries(where);
    return {
      sql: filters.length
        ? ` WHERE ${filters.map(([column]) => `${quoteIdentifier(column)} = ?`).join(" AND ")}`
        : "",
      params: filters.map(([, value]) => value),
    };
  }

  /** Creates a reusable parameterized statement for a custom query. */
  query<T extends Row = any>(sql: string, ...params: SqlValue[]): Statement<T> {
    return new PreparedStatement<T>(this.db, sql, params);
  }

  /** Fetches typed rows from a known application table. */
  select<K extends keyof TableRows>(
    table: K,
    options: {
      columns?: string[];
      where?: Record<string, SqlValue>;
      orderBy?: string;
      descending?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Statement<TableRows[K]>;
  /** Fetches rows from a custom table with optional filters, ordering, and limit. */
  select<T extends Row = Row>(
    table: string,
    options?: {
      columns?: string[];
      where?: Record<string, SqlValue>;
      orderBy?: string;
      descending?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Statement<T>;
  select(
    table: string,
    options: {
      columns?: string[];
      where?: Record<string, SqlValue>;
      orderBy?: string;
      descending?: boolean;
      limit?: number;
      offset?: number;
    } = {},
  ): Statement {
    const columns = options.columns?.length
      ? options.columns.map(quoteIdentifier).join(", ")
      : "*";
    const filter = this.where(options.where ?? {});
    const order = options.orderBy
      ? ` ORDER BY ${quoteIdentifier(options.orderBy)}${options.descending ? " DESC" : " ASC"}`
      : "";
    const limit = options.limit === undefined ? "" : " LIMIT ?";
    const offset = options.offset === undefined ? "" : " OFFSET ?";
    return this.query(
      `SELECT ${columns} FROM ${quoteIdentifier(table)}${filter.sql}${order}${limit}${offset}`,
      ...filter.params,
      ...(options.limit === undefined ? [] : [options.limit]),
      ...(options.offset === undefined ? [] : [options.offset]),
    );
  }

  /** Inserts a row and returns the D1 write metadata. */
  insert(table: string, record: Record<string, SqlValue>): Statement {
    const columns = Object.keys(record);
    if (!columns.length) throw new Error("Cannot insert an empty record");
    return this.query(
      `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
      ...values(columns, record),
    );
  }

  /** Updates matching rows and returns the D1 write metadata. */
  update(
    table: string,
    changes: Record<string, SqlValue>,
    where: Record<string, SqlValue>,
  ): Statement {
    const columns = Object.keys(changes);
    const filters = Object.entries(where);
    if (!columns.length) throw new Error("Cannot update with no changes");
    if (!filters.length) throw new Error("Refusing to update without a WHERE clause");
    return this.query(
      `UPDATE ${quoteIdentifier(table)} SET ${columns.map((column) => `${quoteIdentifier(column)} = ?`).join(", ")} WHERE ${filters.map(([column]) => `${quoteIdentifier(column)} = ?`).join(" AND ")}`,
      ...values(columns, changes),
      ...filters.map(([, value]) => value),
    );
  }

  /** Deletes matching rows and returns the D1 write metadata. */
  delete(table: string, where: Record<string, SqlValue>): Statement {
    const filters = Object.entries(where);
    if (!filters.length) throw new Error("Refusing to delete without a WHERE clause");
    return this.query(
      `DELETE FROM ${quoteIdentifier(table)} WHERE ${filters.map(([column]) => `${quoteIdentifier(column)} = ?`).join(" AND ")}`,
      ...filters.map(([, value]) => value),
    );
  }

  /** Counts rows matching optional filters. */
  async count(table: string, where: Record<string, SqlValue> = {}): Promise<number> {
    const filter = this.where(where);
    const row = await this.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}${filter.sql}`,
      ...filter.params,
    ).first();
    return row?.count ?? 0;
  }

  /** Checks whether at least one row matches the filters. */
  async exists(table: string, where: Record<string, SqlValue>): Promise<boolean> {
    const filter = this.where(where);
    return (await this.query(`SELECT 1 FROM ${quoteIdentifier(table)}${filter.sql} LIMIT 1`, ...filter.params).first()) !== null;
  }

  /** Fetches one matching row or `null`. */
  first<T extends Row = any>(table: string, where: Record<string, SqlValue> = {}): Promise<T | null> {
    return this.select<T>(table, { where, limit: 1 }).first();
  }

  /** Inserts multiple rows in a single D1 batch. */
  insertMany(table: string, records: Record<string, SqlValue>[]): Promise<D1Result<unknown>[]> {
    if (!records.length) return Promise.resolve([]);
    return this.batch(records.map((record) => this.insert(table, record)));
  }

  /** Inserts a row or updates it when a unique conflict occurs. */
  upsert(
    table: string,
    record: Record<string, SqlValue>,
    conflictColumns: string[],
  ): Statement {
    if (!conflictColumns.length) throw new Error("Upsert requires conflict columns");
    const columns = Object.keys(record);
    if (!columns.length) throw new Error("Cannot upsert an empty record");
    const updates = columns
      .filter((column) => !conflictColumns.includes(column))
      .map((column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`)
      .join(", ");
    if (!updates) throw new Error("Upsert requires a non-conflict column to update");
    return this.query(
      `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT (${conflictColumns.map(quoteIdentifier).join(", ")}) DO UPDATE SET ${updates}`,
      ...values(columns, record),
    );
  }

  /** Executes multiple prepared statements as one D1 batch. */
  batch(statements: Statement[]): Promise<D1Result<unknown>[]> {
    return this.db.batch(statements.map((statement) => this.db.prepare(statement.sql).bind(...statement.params)));
  }
}

/** Creates the shared SQL interface for a D1 binding. */
