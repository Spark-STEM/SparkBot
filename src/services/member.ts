import type { Chapter, Member } from "../types.ts";

export interface NameValidationResult {
  valid: boolean;
  normalized?: string;
  error?: string;
}

/**
 * Validates and normalizes a name to "First Name Last Initial." format.
 * Examples:
 *   "Jane Doe" -> "Jane D."
 *   "Jane D"   -> "Jane D."
 *   "Jane D."  -> "Jane D."
 *   "Mary-Jane O'Connor" -> "Mary-Jane O."
 */
export function validateAndNormalizeName(input: string): NameValidationResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { valid: false, error: "Name cannot be empty." };
  }

  // Split by whitespace
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) {
    return {
      valid: false,
      error: "Please provide both your first name and last initial (e.g., Alex K.).",
    };
  }

  const firstName = parts[0]!;
  const lastPart = parts[parts.length - 1]!;
  const initial = lastPart[0]!.toUpperCase();

  // Normalize to "FirstName L."
  const normalized = `${firstName} ${initial}.`;

  if (normalized.length > 32) {
    return {
      valid: false,
      error: "Name is too long for a Discord nickname (max 32 characters).",
    };
  }

  return { valid: true, normalized };
}

/**
 * Fetches all available chapters for dropdown options in registration.
 */
export async function getChapters(db: D1Database): Promise<Chapter[]> {
  const { results } = await db
    .prepare("SELECT id, name, city, region, country FROM chapters ORDER BY country, city")
    .all<Chapter>();

  return results || [];
}

/**
 * Adds or updates a member in the D1 database.
 */
export async function registerMemberInDb(
  db: D1Database,
  data: {
    name: string;
    chapterId: number;
    discordId?: string | null;
    email?: string | null;
  }
): Promise<{ success: boolean; memberId?: number; error?: string }> {
  try {
    // If discordId is provided, check if member already registered
    if (data.discordId) {
      const existing = await db
        .prepare("SELECT id FROM members WHERE discord_id = ?")
        .bind(data.discordId)
        .first<{ id: number }>();

      if (existing) {
        await db
          .prepare(
            "UPDATE members SET name = ?, chapter_id = ?, email = COALESCE(?, email) WHERE discord_id = ?"
          )
          .bind(data.name, data.chapterId, data.email || null, data.discordId)
          .run();

        return { success: true, memberId: existing.id };
      }
    }

    // Insert new member
    const insert = await db
      .prepare(
        "INSERT INTO members (chapter_id, name, email, hours, discord_id) VALUES (?, ?, ?, 0, ?)"
      )
      .bind(data.chapterId, data.name, data.email || null, data.discordId || null)
      .run();

    return {
      success: true,
      memberId: insert.meta.last_row_id as number | undefined,
    };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}
