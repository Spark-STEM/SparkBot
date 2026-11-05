import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "../discordBS/builders/index.ts";
import type { DiscordClient } from "../discordBS/index.ts";
import type { ComponentInteraction } from "../discordBS/interactions/component.ts";
import type { DiscordChannel } from "../discordBS/resources/channel.ts";
import { ChannelType, OverwriteType } from "../discordBS/types/common.ts";
import { PermissionFlagsBits } from "../discordBS/types/permissions.ts";
import { deletePersistentComponents, registerPersistentHandler } from "../discordBS/builders/callbacks.ts";

const TICKET_CATEGORY_ID = "1565858126161510492";
const EXECUTIVE_ROLE_ID = "1334030809577029713";

type TicketStatus = "open" | "locked" | "closed";
type TicketLifecycle = { status: TicketStatus; openerId: string };
type TicketControlParams = {
  channelId: string;
  topic: string;
  status: TicketStatus;
  whitelist: { userIds: string[]; roleIds: string[] };
  action: TicketStatus;
};

function validDiscordId(value: unknown): value is string {
  return typeof value === "string" && /^\d+$/.test(value.trim()) && value.trim() !== "0";
}

function ticketEmbed(topic: string, status: TicketStatus): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`Registration ticket: ${status}`)
    .setDescription(`${topic}\n\nThe person who opened this ticket and authorized registration reviewers can access it.`)
    .setColor(status === "open" ? 0x57f287 : status === "locked" ? 0xfee75c : 0xed4245);
}

function canManageTicket(interaction: ComponentInteraction): boolean {
  return Boolean(interaction.user?.roles.includes(EXECUTIVE_ROLE_ID));
}

registerPersistentHandler("ticket.control", async (interaction, rawParams) => {
  const params = rawParams as unknown as TicketControlParams;
  if (!canManageTicket(interaction)) {
    await interaction.reply({ content: "Only an executive can manage this ticket.", ephemeral: true });
    return;
  }
  const channel = interaction.guild?.getChannel(params.channelId);
  if (!channel) throw new Error(`Ticket channel ${params.channelId} is unavailable.`);
  if (params.action === "closed") {
    await interaction.update({ content: "This ticket has been deleted.", embeds: [], components: [] });
    await deletePersistentComponents(interaction.env, params.channelId);
    await channel.delete();
    return;
  }
  const lifecycle: TicketLifecycle = { status: params.action, openerId: "" };
  const permission = params.action === "locked"
    ? {
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: [PermissionFlagsBits.SendMessages],
    }
    : {
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    };
  await Promise.all([
    ...params.whitelist.userIds.map((id) => channel.editPermissions({ type: OverwriteType.Member, id, ...permission })),
    ...params.whitelist.roleIds.map((id) => channel.editPermissions({ type: OverwriteType.Role, id, ...permission })),
  ]);
  await interaction.update({
    embeds: [ticketEmbed(params.topic, params.action)],
    components: [controls(channel, params.topic, lifecycle, params.whitelist)],
  });
});

function controls(
  channel: DiscordChannel,
  topic: string,
  lifecycle: TicketLifecycle,
  whitelist: { userIds: string[]; roleIds: string[] },
) {
  const lock = new ButtonBuilder().setLabel("Lock").setStyle(ButtonStyle.Secondary);
  const remove = new ButtonBuilder().setLabel("Delete").setStyle(ButtonStyle.Danger);
  const reopen = new ButtonBuilder().setLabel("Open").setStyle(ButtonStyle.Success);

  const persistent = (action: TicketStatus) => ({
    persistent: true as const,
    ownerKey: channel.id,
    persistentKey: action,
    params: { channelId: channel.id, topic, status: lifecycle.status, whitelist, action },
  });
  lock.onClick("ticket.control", persistent("locked"));
  remove.onClick("ticket.control", persistent("closed"));
  reopen.onClick("ticket.control", persistent("open"));
  lock.setDisabled(lifecycle.status === "locked" || lifecycle.status === "closed");
  remove.setDisabled(lifecycle.status === "closed");
  reopen.setDisabled(lifecycle.status === "open");
  return new ActionRowBuilder().addComponents(lock, remove, reopen);
}

export async function createTicket(options: {
  client: DiscordClient;
  guildId: string;
  userId: string;
  topic: string;
  whitelist: { userIds: string[]; roleIds: string[] };
}): Promise<string> {
  const guild = options.client.getGuild(options.guildId);
  const whitelist = {
    userIds: [...new Set([options.userId, ...options.whitelist.userIds].filter(validDiscordId))],
    roleIds: [...new Set(options.whitelist.roleIds.filter(validDiscordId))],
  };
  const channel = await guild.createChannel({
    type: ChannelType.Text,
    name: `registration-${options.userId}`.slice(0, 100),
    categoryId: TICKET_CATEGORY_ID,
  });
  await channel.editPermissions({
    type: OverwriteType.Role,
    id: options.guildId,
    deny: [PermissionFlagsBits.ViewChannel],
  });
  await Promise.all([
    ...whitelist.userIds.map((id) => channel.editPermissions({
      type: OverwriteType.Member,
      id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    })),
    ...whitelist.roleIds.map((id) => channel.editPermissions({
      type: OverwriteType.Role,
      id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    })),
  ]);
  const lifecycle: TicketLifecycle = { status: "open", openerId: options.userId };
  await channel.sendMessage({
    embeds: [ticketEmbed(options.topic, lifecycle.status)],
    components: [controls(channel, options.topic, lifecycle, whitelist)],
  });
  return channel.id;
}
