export interface Env {
  // Cloudflare D1 Database binding
  SPARK_DB: D1Database;
  database: import("./services/database.ts").Database;

  // Discord Bot Secrets
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID?: string;
  DISCORD_TOKEN?: string;

  // Pages notification destination and Cloudflare generic webhook authentication
  CLOUDFLARE_WEBHOOK_SECRET?: string;
  CLOUDFLARE_PAGES_POLICY_ID?: string;

  // Ticket channel configuration
  TICKET_CATEGORY_ID?: string;
  TICKET_ADMIN_ROLE_ID?: string;
  EXECUTIVE_ROLE_ID?: string;
  CHAPTER_LEAD_ROLE_ID?: string;
  CHAPTER_VICE_LEAD_ROLE_ID?: string;
}

export interface Chapter {
  id: number;
  name: string | null;
  city: string;
  region_id: number | null;
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
