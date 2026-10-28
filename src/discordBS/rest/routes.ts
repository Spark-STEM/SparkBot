export const DiscordRoutes = {
  guild: (guildId: string) => `/guilds/${guildId}`,
  guildChannels: (guildId: string) => `/guilds/${guildId}/channels`,
  guildRoles: (guildId: string) => `/guilds/${guildId}/roles`,
  guildMembers: (guildId: string) => `/guilds/${guildId}/members`,
  guildAuditLogs: (guildId: string) => `/guilds/${guildId}/audit-logs`,
  channel: (channelId: string) => `/channels/${channelId}`,
  channelMessages: (channelId: string) => `/channels/${channelId}/messages`,
  message: (channelId: string, messageId: string) => `/channels/${channelId}/messages/${messageId}`,
  webhook: (webhookId: string, token: string) => `/webhooks/${webhookId}/${token}`,
  webhookMessage: (webhookId: string, token: string, messageId: string) =>
    `/webhooks/${webhookId}/${token}/messages/${messageId}`,
} as const;
