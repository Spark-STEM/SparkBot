import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wranglerConfig = await readFile(join(root, "wrangler.toml"), "utf8");
const databaseName = /^\s*database_name\s*=\s*"([^"]+)"/m.exec(wranglerConfig)?.[1];
if (!databaseName) throw new Error("Could not find database_name in wrangler.toml.");

const wrangler = join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const stateRoot = join(root, ".wrangler");
const localDatabase = join(stateRoot, "local-d1");
const refreshDatabase = join(stateRoot, "local-d1-refresh");
const previousDatabase = join(stateRoot, "local-d1-previous");
const exportPath = join(stateRoot, "local-d1-seed.sql");

function runWrangler(args) {
  const result = spawnSync(process.execPath, [wrangler, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const diagnostics = `${result.stdout ?? ""}${result.stderr ?? ""}`
      .replace(/https:\/\/\S+/g, "[redacted URL]");
    throw new Error(`Wrangler ${args.slice(0, 3).join(" ")} failed (exit ${result.status}).\n${diagnostics}`);
  }
}

await mkdir(stateRoot, { recursive: true });
await rm(exportPath, { force: true });
await rm(refreshDatabase, { recursive: true, force: true });

try {
console.log("Exporting remote D1 data. Stop local Wrangler dev before refreshing.");
  runWrangler([
    "d1", "export", databaseName,
    "--remote",
    "--skip-confirmation",
    "--output", exportPath,
  ]);
  const exportInfo = await stat(exportPath);
  if (!exportInfo.isFile() || exportInfo.size === 0) {
    throw new Error("Wrangler produced an empty D1 export.");
  }

  runWrangler([
    "d1", "execute", databaseName,
    "--local",
    "--persist-to", refreshDatabase,
    "--file", exportPath,
    "--yes",
  ]);

  await rm(previousDatabase, { recursive: true, force: true });
  let hadLocalDatabase = false;
  try {
    await access(localDatabase);
    hadLocalDatabase = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (hadLocalDatabase) await rename(localDatabase, previousDatabase);
  try {
    await rename(refreshDatabase, localDatabase);
  } catch (error) {
    if (hadLocalDatabase) await rename(previousDatabase, localDatabase);
    throw error;
  }
  await rm(previousDatabase, { recursive: true, force: true });
  console.log("Local D1 database refreshed. Local bot writes will not affect remote D1.");
} finally {
  await rm(exportPath, { force: true });
  await rm(refreshDatabase, { recursive: true, force: true });
}
