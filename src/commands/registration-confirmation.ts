import { ComponentType, InteractionResponseType, type APIInteractionResponse, type APIMessageComponentInteraction, type APIInteractionResponseChannelMessageWithSource } from "discord-api-types/v10";
import type { Env } from "../types.ts";
import { updateGuildMemberNickname } from "../services/discord-client.ts";

export function privateReply(content: string): APIInteractionResponseChannelMessageWithSource {
  return { type: InteractionResponseType.ChannelMessageWithSource, data: { content, flags: 64, allowed_mentions: { parse: [] } } };
}

export async function finishRegistration(env: Env, discordId: string, guildId: string | undefined, name: string): Promise<APIInteractionResponseChannelMessageWithSource> {
  let note = "";
  if (guildId && env.DISCORD_TOKEN) {
    const result = await updateGuildMemberNickname({ guildId, userId: discordId, nickname: name, botToken: env.DISCORD_TOKEN });
    note = result.success ? " Your server nickname was updated." : " Your registration is saved, but I couldn’t update your server nickname.";
  }
  return privateReply(`✅ Registration complete.${note}`);
}

interface Confirmation { id: string; discord_id: string; guild_id: string | null; name: string; chapter_id: number; candidate_ids: string; expires_at: number; completed: number }

export async function handleRegistrationConfirmation(interaction: APIMessageComponentInteraction, env: Env): Promise<APIInteractionResponse> {
  const [prefix, id] = interaction.data.custom_id.split(":");
  if (prefix !== "register" || !id) return privateReply("Unknown registration action.");
  const discordId = interaction.member?.user.id || interaction.user?.id;
  const pending = await env.SPARK_DB.prepare("SELECT * FROM registration_confirmations WHERE id = ?").bind(id).first<Confirmation>();
  if (!pending || pending.discord_id !== discordId) return privateReply("This confirmation belongs to another registration.");
  if (pending.completed) return privateReply("This registration has already been completed.");
  if (pending.expires_at <= Date.now()) return privateReply("This confirmation expired. Please run /register again.");
  const choice = "values" in interaction.data ? interaction.data.values[0] : undefined;
  const candidateIds: number[] = JSON.parse(pending.candidate_ids);
  if (choice !== "new" && (!choice || !candidateIds.includes(Number(choice)))) return privateReply("Please choose one of the offered options.");
  const db = env.SPARK_DB;
  // D1 batch is transactional. Conditional writes recheck ownership and expiry at commit time.
  const active = "EXISTS (SELECT 1 FROM registration_confirmations WHERE id = ? AND completed = 0 AND expires_at > ?)";
  const now = Date.now();
  const write = choice === "new"
    ? db.prepare(`INSERT INTO members (chapter_id, name, hours, discord_id) SELECT ?, ?, 0, ? WHERE ${active} AND NOT EXISTS (SELECT 1 FROM members WHERE discord_id = ?)`).bind(pending.chapter_id, pending.name, discordId, id, now, discordId)
    : db.prepare(`UPDATE members SET discord_id = ? WHERE id = ? AND discord_id IS NULL AND ${active} AND NOT EXISTS (SELECT 1 FROM members WHERE discord_id = ?)`).bind(discordId, Number(choice), id, now, discordId);
  try {
    const results = await db.batch([
      write,
      db.prepare("UPDATE registration_confirmations SET completed = 1 WHERE id = ? AND EXISTS (SELECT 1 FROM members WHERE discord_id = ?)").bind(id, discordId),
    ]);
    if (!results[0]?.meta.changes) return privateReply("This registration changed or was already completed. Please run /register again if needed.");
  } catch {
    return privateReply("Couldn’t complete registration. Please run /register again.");
  }
  const response = await finishRegistration(env, discordId!, pending.guild_id || undefined, pending.name);
  return { type: InteractionResponseType.UpdateMessage, data: { ...response.data, components: [] } } as APIInteractionResponse;
}

export async function requestConfirmation(env: Env, data: { discordId: string; guildId?: string; name: string; chapterId: number }, candidates: { id: number; name: string; chapter_id: number }[]): Promise<APIInteractionResponse> {
  const id = crypto.randomUUID();
  await env.SPARK_DB.prepare("DELETE FROM registration_confirmations WHERE expires_at <= ?").bind(Date.now()).run();
  await env.SPARK_DB.prepare("INSERT INTO registration_confirmations (id, discord_id, guild_id, name, chapter_id, candidate_ids, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, data.discordId, data.guildId || null, data.name, data.chapterId, JSON.stringify(candidates.map(c => c.id)), Date.now() + 15 * 60_000).run();
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { flags: 64, allowed_mentions: { parse: [] }, content: "We found possible existing members. Are you one of these people? Choose your record, or create a new member. This expires in 15 minutes.", components: [{ type: ComponentType.ActionRow, components: [{ type: ComponentType.StringSelect, custom_id: `register:${id}`, placeholder: "Is one of these you?", options: [...candidates.slice(0, 24).map(c => ({ label: c.name.slice(0, 100), description: `Chapter #${c.chapter_id} · Member #${c.id}`, value: String(c.id) })), { label: "No, create a new member", value: "new" }] }] }] },
  };
}
