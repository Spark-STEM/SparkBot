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

const TICKET_CATEGORY_ID = "1565858126161510492";
const EXECUTIVE_ROLE_ID = "1334030809577029713";

type TicketStatus = "open" | "locked" | "closed";
type TicketLifecycle = { status: TicketStatus; openerId: string };

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

function controls(
  channel: DiscordChannel,
  topic: string,
  lifecycle: TicketLifecycle,
  whitelist: { userIds: string[]; roleIds: string[] },
) {
  const lock = new ButtonBuilder().setLabel("Lock").setStyle(ButtonStyle.Secondary);
  const remove = new ButtonBuilder().setLabel("Delete").setStyle(ButtonStyle.Danger);
  const reopen = new ButtonBuilder().setLabel("Open").setStyle(ButtonStyle.Success);

  const update = async (interaction: ComponentInteraction, nextStatus: TicketStatus) => {
    if (!canManageTicket(interaction)) {
      await interaction.reply({ content: "Only an executive can manage this ticket.", ephemeral: true });
      return;
    }
    if (nextStatus === "closed") {
      lifecycle.status = "closed";
      await interaction.update({ content: "This ticket has been deleted.", embeds: [], components: [] });
      await channel.delete();
      return;
    }

    lifecycle.status = nextStatus;
    const permission = nextStatus === "locked"
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
      ...whitelist.userIds.map((id) => channel.editPermissions({ type: OverwriteType.Member, id, ...permission })),
      ...whitelist.roleIds.map((id) => channel.editPermissions({ type: OverwriteType.Role, id, ...permission })),
    ]);
    await interaction.update({
      embeds: [ticketEmbed(topic, nextStatus)],
      components: [controls(channel, topic, lifecycle, whitelist)],
    });
  };

  lock.onClick((interaction) => update(interaction, "locked"));
  remove.onClick((interaction) => update(interaction, "closed"));
  reopen.onClick((interaction) => update(interaction, "open"));
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
