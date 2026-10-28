import { registerCommands } from "../src/handler/register-commands.ts";

try {
  await registerCommands();
} catch (error) {
  console.error("Failed to register slash commands:", error);
  process.exit(1);
}
