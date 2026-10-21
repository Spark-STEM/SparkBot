/**
 * Interacts with Discord's REST API.
 */
export async function updateGuildMemberNickname(params: {
  guildId: string;
  userId: string;
  nickname: string;
  botToken: string;
}): Promise<{ success: boolean; error?: string }> {
  const { guildId, userId, nickname, botToken } = params;

  try {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ nick: nickname }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Discord API error (${response.status}): ${errorText}`,
      };
    }

    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || String(err),
    };
  }
}
