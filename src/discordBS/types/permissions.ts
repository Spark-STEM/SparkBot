import { OverwriteType } from "./common.ts";
export { OverwriteType } from "./common.ts";

/** Discord permission bit values, matching Discord.js `PermissionFlagsBits`. */
export const PermissionFlagsBits = {
  CreateInstantInvite: 1n << 0n,
  KickMembers: 1n << 1n,
  BanMembers: 1n << 2n,
  Administrator: 1n << 3n,
  ManageChannels: 1n << 4n,
  ManageGuild: 1n << 5n,
  AddReactions: 1n << 6n,
  ViewAuditLog: 1n << 7n,
  PrioritySpeaker: 1n << 8n,
  Stream: 1n << 9n,
  ViewChannel: 1n << 10n,
  SendMessages: 1n << 11n,
  SendTTSMessages: 1n << 12n,
  ManageMessages: 1n << 13n,
  EmbedLinks: 1n << 14n,
  AttachFiles: 1n << 15n,
  ReadMessageHistory: 1n << 16n,
  MentionEveryone: 1n << 17n,
  UseExternalEmojis: 1n << 18n,
  ViewGuildInsights: 1n << 19n,
  Connect: 1n << 20n,
  Speak: 1n << 21n,
  MuteMembers: 1n << 22n,
  DeafenMembers: 1n << 23n,
  MoveMembers: 1n << 24n,
  UseVAD: 1n << 25n,
  ChangeNickname: 1n << 26n,
  ManageNicknames: 1n << 27n,
  ManageRoles: 1n << 28n,
  ManageWebhooks: 1n << 29n,
  ManageGuildExpressions: 1n << 30n,
  UseApplicationCommands: 1n << 31n,
  RequestToSpeak: 1n << 32n,
  ManageEvents: 1n << 33n,
  ManageThreads: 1n << 34n,
  CreatePublicThreads: 1n << 35n,
  CreatePrivateThreads: 1n << 36n,
  UseExternalStickers: 1n << 37n,
  SendMessagesInThreads: 1n << 38n,
  UseEmbeddedActivities: 1n << 39n,
  ModerateMembers: 1n << 40n,
  ViewCreatorMonetizationAnalytics: 1n << 41n,
  UseSoundboard: 1n << 42n,
  CreateGuildExpressions: 1n << 43n,
  CreateEvents: 1n << 44n,
  UseExternalSounds: 1n << 45n,
  SendVoiceMessages: 1n << 46n,
} as const;

export type PermissionFlag = (typeof PermissionFlagsBits)[keyof typeof PermissionFlagsBits];

export interface PermissionOverwrite {
  type: OverwriteType;
  id: string;
  allow?: PermissionFlag[];
  deny?: PermissionFlag[];
}

/** Converts bigint permission flags into Discord's decimal bitfield format. */
export function permissionBits(permissions: PermissionFlag[] = []): string {
  return permissions.reduce((bits, permission) => bits | permission, 0n).toString();
}

/** A composable Discord permission bitfield. */
export class PermissionBitField {
  constructor(readonly bitfield = 0n) {}

  /** Creates a bitfield from individual permission flags. */
  static from(permissions: PermissionFlag[] = []): PermissionBitField {
    return new PermissionBitField(permissions.reduce((bits, permission) => bits | permission, 0n));
  }

  /** Returns whether every supplied permission is granted. */
  has(...permissions: PermissionFlag[]): boolean {
    const required = permissions.reduce((bits, permission) => bits | permission, 0n);
    return (this.bitfield & required) === required;
  }

  /** Returns whether at least one supplied permission is granted. */
  any(...permissions: PermissionFlag[]): boolean {
    return permissions.some((permission) => (this.bitfield & permission) === permission);
  }

  /** Returns the decimal Discord bitfield representation. */
  toString(): string { return this.bitfield.toString(); }
}

/** Applies Discord's role and channel-overwrite precedence rules to a base bitfield. */
export function calculateEffectivePermissions(
  base: bigint,
  overwrites: readonly PermissionOverwrite[],
  userId: string,
  roleIds: readonly string[],
  everyoneRoleId?: string,
): PermissionBitField {
  let permissions = base;
  const everyone = overwrites.find((overwrite) =>
    overwrite.type === OverwriteType.Role && overwrite.id === everyoneRoleId);
  if (everyone) permissions = (permissions & ~permissionBitsToBigInt(everyone.deny)) | permissionBitsToBigInt(everyone.allow);
  const roleOverwrites = overwrites.filter((overwrite) =>
    overwrite.type === OverwriteType.Role && roleIds.includes(overwrite.id) && overwrite.id !== everyoneRoleId);
  permissions = (permissions & ~roleOverwrites.reduce((bits, overwrite) => bits | permissionBitsToBigInt(overwrite.deny), 0n)) |
    roleOverwrites.reduce((bits, overwrite) => bits | permissionBitsToBigInt(overwrite.allow), 0n);
  const member = overwrites.find((overwrite) => overwrite.type === OverwriteType.Member && overwrite.id === userId);
  if (member) permissions = (permissions & ~permissionBitsToBigInt(member.deny)) | permissionBitsToBigInt(member.allow);
  return new PermissionBitField(permissions);
}

function permissionBitsToBigInt(permissions: PermissionFlag[] = []): bigint {
  return permissions.reduce((bits, permission) => bits | permission, 0n);
}
