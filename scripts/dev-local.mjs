import { readFile, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const localValues = {
  DISCORD_PUBLIC_KEY: process.env.LOCAL_DISCORD_PUBLIC_KEY,
  DISCORD_TOKEN: process.env.LOCAL_DISCORD_TOKEN,
  DEPLOY_NOTIFICATION_CHANNEL_ID: "",
};

for (const key of ["LOCAL_DISCORD_PUBLIC_KEY", "LOCAL_DISCORD_TOKEN", "LOCAL_DISCORD_APPLICATION_ID"]) {
  if (!process.env[key]) throw new Error(`${key} is required in .env for local development.`);
}
if (!/^\d+$/.test(process.env.LOCAL_DISCORD_APPLICATION_ID)) {
  throw new Error("LOCAL_DISCORD_APPLICATION_ID must be a numeric Discord application ID.");
}

for (const [key, value] of Object.entries(localValues)) {
  if (value !== undefined && /[\r\n]/.test(value)) {
    throw new Error(`${key} must not contain line breaks.`);
  }
}

const registrationRuntime = process.versions.bun ? process.execPath : "node";
const registrationArgs = process.versions.bun
  ? ["run", "scripts/register-commands.ts", "--local"]
  : ["--import", "tsx", "scripts/register-commands.ts", "--local"];
const registration = spawnSync(registrationRuntime, registrationArgs, {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
if (registration.error) throw registration.error;
if (registration.status !== 0) {
  throw new Error(`Local slash-command registration failed (exit ${registration.status}).`);
}

const varsPath = join(root, ".dev.vars");
let existing = "";
try {
  existing = await readFile(varsPath, "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const managedKeys = new Set(Object.keys(localValues));
const retainedLines = existing.split(/\r?\n/).filter((line) => {
  const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
  return !match || !managedKeys.has(match[1]);
});
while (retainedLines.length && retainedLines.at(-1) === "") retainedLines.pop();
const generatedLines = Object.entries(localValues)
  .filter(([, value]) => value !== undefined)
  .map(([key, value]) => `${key}=${JSON.stringify(value)}`);
await writeFile(varsPath, [...retainedLines, ...generatedLines, ""].join("\n"), { mode: 0o600 });

const wrangler = join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const wranglerEnv = { ...process.env };
for (const key of [
  "DISCORD_APPLICATION_ID",
  "DISCORD_PUBLIC_KEY",
  "DISCORD_TOKEN",
  "LOCAL_DISCORD_APPLICATION_ID",
  "LOCAL_DISCORD_PUBLIC_KEY",
  "LOCAL_DISCORD_TOKEN",
]) {
  delete wranglerEnv[key];
}
const args = [
  wrangler,
  "dev",
  "--local",
  "--tunnel",
  "--persist-to",
  ".wrangler/local-d1",
  ...process.argv.slice(2),
];
const child = spawn(process.execPath, args, {
  cwd: root,
  stdio: ["inherit", "pipe", "pipe"],
  env: wranglerEnv,
});

let outputTail = "";
let tunnelHandled = false;

function copyTunnelUrl(url) {
  const command = process.platform === "win32"
    ? ["clip.exe", [], url]
    : process.platform === "darwin"
      ? ["pbcopy", [], url]
      : ["xclip", ["-selection", "clipboard"], url];
  const [executable, commandArgs, input] = command;
  const result = spawnSync(executable, commandArgs, { input, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    console.warn(`Could not copy the tunnel URL automatically: ${result.error?.message ?? result.stderr ?? "clipboard command failed"}`);
    return false;
  }
  return true;
}

function openUrl(url) {
  let executable;
  let args;
  if (process.platform === "win32") {
    executable = "powershell.exe";
    args = ["-NoProfile", "-NonInteractive", "-Command", `Start-Process '${url}'`];
  } else if (process.platform === "darwin") {
    executable = "open";
    args = [url];
  } else {
    executable = "xdg-open";
    args = [url];
  }
  const result = spawnSync(executable, args, { stdio: "ignore" });
  if (result.error || result.status !== 0) {
    console.warn(`Could not open the Discord developer portal automatically: ${result.error?.message ?? "browser command failed"}`);
  }
}

function handleOutput(chunk, destination) {
  const text = chunk.toString();
  destination.write(text);
  if (tunnelHandled) return;

  outputTail = (outputTail + text).slice(-4096);
  const tunnelUrl = /https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/i.exec(outputTail)?.[0];
  if (!tunnelUrl) return;
  tunnelHandled = true;

  const portalUrl = `https://discord.com/developers/applications/${process.env.LOCAL_DISCORD_APPLICATION_ID}/information`;
  console.log(`\nLocal Discord Interactions Endpoint URL: ${tunnelUrl}`);
  console.log(`Discord application settings: ${portalUrl}`);
  if (copyTunnelUrl(tunnelUrl)) console.log("Tunnel URL copied to clipboard.");
  openUrl(portalUrl);
}

child.stdout.on("data", (chunk) => handleOutput(chunk, process.stdout));
child.stderr.on("data", (chunk) => handleOutput(chunk, process.stderr));
child.on("error", (error) => {
  console.error("Could not start Wrangler local development:", error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = signal ? 1 : code ?? 1;
});
