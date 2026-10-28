import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { basename, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, "src");
const output = join(src, "generated", "registry.ts");
const databaseSchemaOutput = join(src, "generated", "databaseSchema.ts");
const wrangler = join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const wranglerConfig = await readFile(join(root, "wrangler.toml"), "utf8");
const databaseName = /^\s*database_name\s*=\s*"([^"]+)"/m.exec(wranglerConfig)?.[1];
if (!databaseName) throw new Error("Could not find database_name in wrangler.toml.");

function findClosingParenthesis(text, openIndex) {
  let depth = 0;
  let quote = null;
  for (let index = openIndex; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (character === quote) {
        if (text[index + 1] === quote) index += 1;
        else quote = null;
      } else if (quote === "]" && character === "]") {
        quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"' || character === "`") quote = character;
    else if (character === "[") quote = "]";
    else if (character === "(") depth += 1;
    else if (character === ")" && --depth === 0) return index;
  }
  throw new Error("Unclosed parenthesis in exported D1 schema.");
}

function splitDefinitions(definitions) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let index = 0; index < definitions.length; index += 1) {
    const character = definitions[index];
    if (quote) {
      if (character === quote) {
        if (definitions[index + 1] === quote) index += 1;
        else quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"' || character === "`") quote = character;
    else if (character === "[") quote = "]";
    else if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === "," && depth === 0) {
      parts.push(definitions.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(definitions.slice(start).trim());
  return parts.filter(Boolean);
}

function readIdentifier(text) {
  const value = text.trimStart();
  const first = value[0];
  if (first === '"' || first === "`" || first === "[") {
    const closing = first === "[" ? "]" : first;
    const end = value.indexOf(closing, 1);
    if (end < 0) throw new Error(`Invalid identifier in D1 schema: ${value}`);
    return {
      name: value.slice(1, end).replaceAll(closing + closing, closing),
      rest: value.slice(end + 1).trim(),
    };
  }
  const match = /^([^\s]+)([\s\S]*)$/.exec(value);
  if (!match) throw new Error(`Invalid identifier in D1 schema: ${value}`);
  return { name: match[1], rest: match[2].trim() };
}

function sqliteType(declaration) {
  const type = declaration.toUpperCase();
  if (type.includes("INT")) return "number";
  if (type.includes("CHAR") || type.includes("CLOB") || type.includes("TEXT")) return "string";
  if (type.includes("BLOB") || !type) return "ArrayBuffer";
  if (type.includes("REAL") || type.includes("FLOA") || type.includes("DOUB")) return "number";
  return "number | string";
}

function parseDatabaseSchema(sql) {
  const tables = {};
  const createTable = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/ig;
  for (const match of sql.matchAll(createTable)) {
    const nameStart = match.index + match[0].length;
    const { name, rest } = readIdentifier(sql.slice(nameStart));
    if (name === "d1_migrations") continue;
    const openIndex = nameStart + sql.slice(nameStart).indexOf("(");
    if (openIndex < nameStart) throw new Error(`Missing column list for D1 table "${name}".`);
    const closeIndex = findClosingParenthesis(sql, openIndex);
    const columns = {};
    for (const definition of splitDefinitions(sql.slice(openIndex + 1, closeIndex))) {
      const { name: columnName, rest: declaration } = readIdentifier(definition);
      if (/^(?:CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN)$/i.test(columnName)) continue;
      const typeDeclaration = declaration.split(
        /\s+(?=(?:NOT\s+NULL|PRIMARY\s+KEY|UNIQUE|CHECK\s*\(|DEFAULT|COLLATE|REFERENCES|GENERATED|AS)\b)/i,
        1,
      )[0].trim();
      const required = /\bNOT\s+NULL\b/i.test(declaration) || /\bPRIMARY\s+KEY\b/i.test(declaration);
      columns[columnName] = `${sqliteType(typeDeclaration)}${required ? "" : " | null"}`;
    }
    if (Object.keys(columns).length) tables[name] = columns;
  }
  if (!Object.keys(tables).length) {
    throw new Error("No D1 tables were found in the remote schema export.");
  }
  return tables;
}

function toTypeScript(tables) {
  const lines = [
    "// Generated from the configured remote D1 database by scripts/generate-registry.mjs. Do not edit by hand.",
    "export interface TableRows {",
  ];
  for (const [table, columns] of Object.entries(tables)) {
    lines.push(`  ${JSON.stringify(table)}: {`);
    for (const [column, type] of Object.entries(columns)) {
      lines.push(`    ${JSON.stringify(column)}: ${type};`);
    }
    lines.push("  };");
  }
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

async function generateDatabaseTypes() {
  await mkdir(join(root, ".wrangler"), { recursive: true });
  const tempDir = await mkdtemp(join(root, ".wrangler", "schema-"));
  const sqlPath = join(tempDir, "schema.sql");
  try {
    const result = spawnSync(process.execPath, [
      wrangler,
      "d1",
      "export",
      databaseName,
      "--remote",
      "--no-data",
      "--skip-confirmation",
      "--output",
      sqlPath,
    ], { cwd: root, encoding: "utf8" });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      const diagnostics = `${result.stdout ?? ""}${result.stderr ?? ""}`
        .replace(/https:\/\/\S+/g, "[redacted URL]");
      throw new Error(`Could not export the remote D1 schema (exit ${result.status}).\n${diagnostics}`);
    }
    const tables = parseDatabaseSchema(await readFile(sqlPath, "utf8"));
    await writeFile(databaseSchemaOutput, toTypeScript(tables));
    console.log(`Generated database types for ${Object.keys(tables).length} remote D1 tables.`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function sourceFiles(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await sourceFiles(path));
    else if (/\.(?:ts|js)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) found.push(path);
  }
  return found.sort();
}

function importPath(from, to) {
  const path = relative(dirname(from), to).split(sep).join("/");
  return path.startsWith(".") ? path : `./${path}`;
}

const commandFiles = (await sourceFiles(join(src, "slashcommands")))
  .filter((path) => basename(path) !== "types.ts");
const webhookFiles = (await sourceFiles(join(src, "webhooks")))
  .filter((path) => basename(path) !== "types.ts");

const commandImports = commandFiles.map((path, index) => `import command${index} from "${importPath(output, path)}";`);
const webhookImports = webhookFiles.map((path, index) => `import webhook${index} from "${importPath(output, path)}";`);
const commandValues = commandFiles.map((_, index) => `command${index}`).join(", ");
const webhookValues = webhookFiles.map((_, index) => `webhook${index}`).join(", ");

await generateDatabaseTypes();

const content = `// Generated by scripts/generate-registry.mjs. Do not edit by hand.
import type { SlashCommand } from "../slashcommands/types.ts";
import type { Webhook } from "../webhooks/types.ts";
${[...commandImports, ...webhookImports].join("\n")}

export const commands: SlashCommand[] = [${commandValues}];
export const webhooks: Webhook[] = [${webhookValues}];

const webhookPaths = new Set<string>();
for (const webhook of webhooks) {
  if (!webhook.pathname.startsWith("/")) {
    throw new Error(\`Webhook path must start with "/": \${webhook.pathname}\`);
  }
  if (webhookPaths.has(webhook.pathname)) {
    throw new Error(\`Duplicate webhook pathname: \${webhook.pathname}\`);
  }
  webhookPaths.add(webhook.pathname);
}
`;

await mkdir(dirname(output), { recursive: true });
await writeFile(output, content);
console.log(`Generated registry with ${commandFiles.length} commands and ${webhookFiles.length} webhooks.`);
