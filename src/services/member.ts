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
            "UPDATE members SET chapter_id = ?, email = COALESCE(?, email) WHERE discord_id = ?"
          )
          .bind(data.chapterId, data.email || null, data.discordId)
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

/** Comparison only: never use this key as a display name. */
export function nameKey(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").trim().replace(/\s+/g, " ");
}

export function editDistance(a: string, b: string): number {
  const left = Array.from(a), right = Array.from(b);
  let row = right.map((_, i) => i + 1);
  row.unshift(0);
  for (let i = 0; i < left.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < right.length; j++) {
      next.push(Math.min(next[j]! + 1, row[j + 1]! + 1, row[j]! + (left[i] === right[j] ? 0 : 1)));
    }
    row = next;
  }
  return row[right.length]!;
}

export function matchScore(input: string, existing: string): number | null {
  const a = nameKey(input), b = nameKey(existing);
  if (a === b) return 0;
  const ap = a.split(" "), bp = b.split(" ");
  if (ap.length < 2 || bp.length < 2) return null;
  const af = ap[0]!, bf = bp[0]!, al = ap.at(-1)!, bl = bp.at(-1)!;
  if (al[0] !== bl[0]) return null;
  if (af === bf && (al.length === 1 || bl.length === 1)) return 1;
  const distance = editDistance(a, b);
  // Keep short names conservative; first-name typos require at least four letters.
  if (Math.min(af.length, bf.length) < 4) return null;
  return distance <= (Math.max(a.length, b.length) >= 12 ? 2 : 1) ? distance + 1 : null;
}

export async function findMemberCandidates(db: D1Database, name: string, chapterId: number): Promise<Member[]> {
  const { results } = await db.prepare("SELECT * FROM members WHERE discord_id IS NULL").all<Member>();
  return results.map(member => ({ member, score: matchScore(name, member.name) }))
    .filter((item): item is { member: Member; score: number } => item.score !== null)
    .sort((a, b) => a.score - b.score || Number(b.member.chapter_id === chapterId) - Number(a.member.chapter_id === chapterId) || a.member.id - b.member.id)
    .map(item => item.member);
}
