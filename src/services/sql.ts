export interface SqlAnalysis {
  isMutation: boolean;
  operations: string[];
  warning?: string;
}

export interface SqlExecutionResult {
  sql: string;
  isMutation: boolean;
  warning?: string;
  success: boolean;
  durationMs: number;
  changes?: number;
  rows?: Record<string, any>[];
  columns?: string[];
  error?: string;
}

const MUTATION_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "ALTER",
  "CREATE",
  "REPLACE",
  "TRUNCATE",
  "PRAGMA",
];

/**
 * Analyzes a SQL string for mutating / modifying operations.
 */
export function analyzeSqlQuery(sql: string): SqlAnalysis {
  // Strip comments and strings to avoid false positives
  const sanitized = sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  const foundOps = new Set<string>();

  for (const keyword of MUTATION_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(sanitized)) {
      foundOps.add(keyword.toUpperCase());
    }
  }

  const operations = Array.from(foundOps);
  const isMutation = operations.length > 0;

  let warning: string | undefined;
  if (isMutation) {
    warning = `⚠️ **Schema/Data Modification Detected!** Operations: \`${operations.join(", ")}\``;
  }

  return { isMutation, operations, warning };
}

/**
 * Executes a raw SQL query against D1 and returns structured results.
 */
export async function executeSqlQuery(db: D1Database, sql: string): Promise<SqlExecutionResult> {
  const analysis = analyzeSqlQuery(sql);
  const start = performance.now();

  try {
    const response = await db.prepare(sql).all();
    const durationMs = Math.round((performance.now() - start) * 100) / 100;

    const rows = response.results || [];
    const columns = rows.length > 0 ? Object.keys(rows[0]!) : [];
    const changes = response.meta?.changes ?? 0;

    return {
      sql,
      isMutation: analysis.isMutation,
      warning: analysis.warning,
      success: true,
      durationMs,
      changes,
      rows,
      columns,
    };
  } catch (err: any) {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    return {
      sql,
      isMutation: analysis.isMutation,
      warning: analysis.warning,
      success: false,
      durationMs,
      error: err.message || String(err),
    };
  }
}

/**
 * Formats SQL execution results into a Discord message.
 * Enforces Discord's 2,000-character message ceiling.
 */
export function formatSqlResult(result: SqlExecutionResult): string {
  const lines: string[] = [];

  if (result.warning) {
    lines.push(result.warning);
  }

  if (!result.success) {
    lines.push(`❌ **Execution Failed** (${result.durationMs}ms)`);
    lines.push(`\`\`\`\n${result.error}\n\`\`\``);
    return lines.join("\n");
  }

  lines.push(`⏱️ Execution Time: **${result.durationMs}ms**`);
  if (result.isMutation) {
    lines.push(`📝 Rows Affected / Changed: **${result.changes ?? 0}**`);
  }

  if (!result.rows || result.rows.length === 0) {
    lines.push("ℹ️ *Query executed successfully (0 rows returned).*");
    return lines.join("\n");
  }

  lines.push(`📊 **Results (${result.rows.length} row${result.rows.length === 1 ? "" : "s"}):**`);

  // Format as JSON or table within code block
  const jsonPreview = JSON.stringify(result.rows, null, 2);
  const maxCodeBlockLength = 1500; // Keep headroom for Discord's 2000 char limit

  if (jsonPreview.length <= maxCodeBlockLength) {
    lines.push(`\`\`\`json\n${jsonPreview}\n\`\`\``);
  } else {
    // Truncate to first few rows
    const truncatedRows = result.rows.slice(0, 5);
    const partialJson = JSON.stringify(truncatedRows, null, 2);
    lines.push(`\`\`\`json\n${partialJson}\n\`\`\``);
    lines.push(`*(Output truncated: showing 5 of ${result.rows.length} rows)*`);
  }

  return lines.join("\n");
}
