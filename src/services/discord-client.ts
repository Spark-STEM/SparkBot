/**
 * Interacts with Discord's REST API.
 */
export async function sendDeploymentMessage(params: {
  channelId: string;
  botToken: string;
  text: string;
  nonce: string;
}): Promise<void> {
  const response = await fetch(
    `https://discord.com/api/v10/channels/${params.channelId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${params.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: `**Website deployment update**\nhttps://spark-stem.pages.dev\n\n${params.text}`.slice(0, 2000),
        allowed_mentions: { parse: [] },
        nonce: params.nonce,
        enforce_nonce: true,
      }),
      signal: AbortSignal.timeout(10_000),
    }
  );
  // Do not log Discord's response body: it can echo notification content.
  await response.body?.cancel();
  if (!response.ok) throw new Error(`Discord message failed (${response.status})`);
}

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
