import { describe, it, expect } from "bun:test";
import {
  analyzeSqlQuery,
  formatSqlResult,
  type SqlExecutionResult,
} from "../src/services/sql.ts";

describe("SQL Service - Query Analysis & Mutation Detection", () => {
  it("identifies read-only queries with no warnings", () => {
    const res = analyzeSqlQuery("SELECT * FROM chapters;");
    expect(res.isMutation).toBe(false);
    expect(res.operations).toEqual([]);
    expect(res.warning).toBeUndefined();
  });

  it("identifies complex SELECT queries with JOINs as read-only", () => {
    const res = analyzeSqlQuery(
      "SELECT p.name, s.name FROM programs p LEFT JOIN schools s ON p.school_id = s.id WHERE status = 'active'"
    );
    expect(res.isMutation).toBe(false);
    expect(res.operations).toEqual([]);
    expect(res.warning).toBeUndefined();
  });

  it("detects UPDATE statements and generates warning", () => {
    const res = analyzeSqlQuery("UPDATE members SET hours = hours + 1 WHERE id = 1");
    expect(res.isMutation).toBe(true);
    expect(res.operations).toContain("UPDATE");
    expect(res.warning).toContain("Schema/Data Modification Detected");
    expect(res.warning).toContain("UPDATE");
  });

  it("detects DELETE statements", () => {
    const res = analyzeSqlQuery("DELETE FROM members WHERE discord_id = '123'");
    expect(res.isMutation).toBe(true);
    expect(res.operations).toContain("DELETE");
  });

  it("detects INSERT statements", () => {
    const res = analyzeSqlQuery("INSERT INTO chapters (name, city, country) VALUES ('Test', 'City', 'US')");
    expect(res.isMutation).toBe(true);
    expect(res.operations).toContain("INSERT");
  });

  it("detects DROP TABLE and ALTER TABLE schema modifications", () => {
    const res = analyzeSqlQuery("ALTER TABLE members ADD COLUMN notes TEXT;");
    expect(res.isMutation).toBe(true);
    expect(res.operations).toContain("ALTER");

    const dropRes = analyzeSqlQuery("DROP TABLE temp_table;");
    expect(dropRes.isMutation).toBe(true);
    expect(dropRes.operations).toContain("DROP");
  });

  it("detects multiple mutation keywords in complex queries", () => {
    const res = analyzeSqlQuery("INSERT INTO roles (name) VALUES ('X'); DELETE FROM roles WHERE id = 99;");
    expect(res.isMutation).toBe(true);
    expect(res.operations).toContain("INSERT");
    expect(res.operations).toContain("DELETE");
  });

  it("is case-insensitive", () => {
    const res = analyzeSqlQuery("update members set name = 'test'");
    expect(res.isMutation).toBe(true);
    expect(res.operations).toContain("UPDATE");
  });
});

describe("SQL Service - Result Formatter", () => {
  it("formats successful read query with rows", () => {
    const result: SqlExecutionResult = {
      sql: "SELECT name FROM chapters",
      isMutation: false,
      success: true,
      durationMs: 1.25,
      rows: [{ name: "Woodinville" }, { name: "Bothell" }],
      columns: ["name"],
    };

    const formatted = formatSqlResult(result);
    expect(formatted).toContain("⏱️ Execution Time: **1.25ms**");
    expect(formatted).toContain("📊 **Results (2 rows):**");
    expect(formatted).toContain("Woodinville");
    expect(formatted).not.toContain("Modification Detected");
  });

  it("formats successful mutation query with warning and rows affected", () => {
    const result: SqlExecutionResult = {
      sql: "UPDATE members SET hours = 5",
      isMutation: true,
      warning: "⚠️ **Schema/Data Modification Detected!** Operations: `UPDATE`",
      success: true,
      durationMs: 2.1,
      changes: 14,
      rows: [],
    };

    const formatted = formatSqlResult(result);
    expect(formatted).toContain("⚠️ **Schema/Data Modification Detected!**");
    expect(formatted).toContain("📝 Rows Affected / Changed: **14**");
  });

  it("formats execution errors cleanly", () => {
    const result: SqlExecutionResult = {
      sql: "SELECT * FROM nonexistent_table",
      isMutation: false,
      success: false,
      durationMs: 0.5,
      error: "no such table: nonexistent_table",
    };

    const formatted = formatSqlResult(result);
    expect(formatted).toContain("❌ **Execution Failed**");
    expect(formatted).toContain("no such table: nonexistent_table");
  });

  it("truncates massive output to protect against Discord 2000 character limit", () => {
    const manyRows = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      data: "A".repeat(100),
    }));

    const result: SqlExecutionResult = {
      sql: "SELECT * FROM large_table",
      isMutation: false,
      success: true,
      durationMs: 4.5,
      rows: manyRows,
      columns: ["id", "data"],
    };

    const formatted = formatSqlResult(result);
    expect(formatted.length).toBeLessThan(2000);
    expect(formatted).toContain("Output truncated: showing 5 of 50 rows");
  });
});
