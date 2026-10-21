export interface Env {
  // Cloudflare D1 Database binding
  SPARK_DB: D1Database;

  // Discord Bot Secrets
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID?: string;
  DISCORD_TOKEN?: string;

  // Optional comma-separated list of Discord user IDs with admin privileges
  ADMIN_USER_IDS?: string;
}

export interface Chapter {
  id: number;
  name: string | null;
  city: string;
  region: string | null;
  country: string;
}

export interface Member {
  id: number;
  chapter_id: number;
  name: string;
  email: string | null;
  hours: number;
  discord_id: string | null;
}
