import { PermissionFlagsBits } from "discord-api-types/v10";

/**
 * Checks if a given permission bitfield includes the Administrator permission.
 * Discord permissions can be sent as string representations of bitfields.
 */
export function isAdministrator(permissions?: string | bigint | number): boolean {
  if (!permissions) return false;
  try {
    const bitfield = BigInt(permissions);
    // Administrator bit (1n << 3n = 8n)
    return (bitfield & PermissionFlagsBits.Administrator) === PermissionFlagsBits.Administrator;
  } catch {
    return false;
  }
}

/**
 * Multi-layer Admin Check:
 * 1. Discord Guild Administrator permission
 * 2. Hardcoded / env-configured admin Discord user IDs
 * 3. D1 database role check ('Admin Team' or 'Executive Board' in member_roles)
 */
export async function checkIsAdmin(params: {
  permissions?: string | bigint | number;
  userId?: string | null;
  adminUserIds?: string;
  db?: D1Database;
}): Promise<boolean> {
  const { permissions, userId, adminUserIds, db } = params;

  // 1. Check Discord server Administrator permission
  if (isAdministrator(permissions)) {
    return true;
  }

  // 2. Check env-configured Admin User IDs
  if (userId && adminUserIds) {
    const allowed = adminUserIds.split(",").map((s) => s.trim());
    if (allowed.includes(userId)) {
      return true;
    }
  }

  // 3. Check D1 database member_roles
  if (userId && db) {
    try {
      const match = await db
        .prepare(
          `SELECT 1 FROM member_roles mr
           JOIN members m ON mr.member_id = m.id
           JOIN roles r ON mr.role_id = r.id
           WHERE m.discord_id = ?
             AND (r.name = 'Admin Team' OR r.name = 'Executive Board' OR r.id IN (1, 2))
           LIMIT 1`
        )
        .bind(userId)
        .first();

      if (match) {
        return true;
      }
    } catch {
      // Fallback if query fails
    }
  }

  return false;
}
