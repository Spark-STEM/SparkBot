import type { Json } from "../types/common.ts";
import type { DiscordRestClient } from "../rest/client.ts";
import { DiscordUser } from "../resources/user.ts";
import { DiscordRole } from "../resources/role.ts";
import { DiscordChannel } from "../resources/channel.ts";
import { DiscordAttachment } from "../resources/attachment.ts";
import { DiscordMember } from "../resources/member.ts";

export class CommandOptions {
  constructor(
    private readonly client: DiscordRestClient,
    private readonly guildId: string | null,
    private readonly options: readonly Json[],
  ) {}

  getString(name: string, required = false): string | null {
    const value = this.options.find((option) => option.name === name)?.value;
    if (typeof value === "string") return value;
    if (required) throw new Error(`Missing required option: ${name}`);
    return null;
  }

  getInteger(name: string, required = false): number | null {
    const value = this.options.find((option) => option.name === name)?.value;
    if (typeof value === "number") return value;
    if (required) throw new Error(`Missing required option: ${name}`);
    return null;
  }

  getNumber(name: string, required = false): number | null {
    return this.getInteger(name, required);
  }

  getBoolean(name: string, required = false): boolean | null {
    const value = this.options.find((option) => option.name === name)?.value;
    if (typeof value === "boolean") return value;
    if (required) throw new Error(`Missing required option: ${name}`);
    return null;
  }

  getUser(name: string, required = false): DiscordUser | null {
    return this.resourceOption(name, required, (id) => new DiscordUser(this.client, id, { id }));
  }

  getMember(name: string, required = false): DiscordMember | null {
    if (!this.guildId) {
      if (required) throw new Error(`Option ${name} is unavailable outside a guild.`);
      return null;
    }
    return this.resourceOption(name, required, (id) => new DiscordMember(this.client, this.guildId!, id, { user: { id } }));
  }

  getRole(name: string, required = false): DiscordRole | null {
    if (!this.guildId) {
      if (required) throw new Error(`Option ${name} is unavailable outside a guild.`);
      return null;
    }
    return this.resourceOption(name, required, (id) => new DiscordRole(this.client, this.guildId!, id, { id }));
  }

  getChannel(name: string, required = false): DiscordChannel | null {
    return this.resourceOption(name, required, (id) => new DiscordChannel(this.client, id, { id }));
  }

  getAttachment(name: string, required = false): DiscordAttachment | null {
    return this.resourceOption(name, required, (id) => new DiscordAttachment(id, { id }));
  }

  getMentionable(name: string, required = false): DiscordUser | DiscordRole | null {
    const option = this.options.find((candidate) => candidate.name === name);
    const id = typeof option?.value === "string" ? option.value : null;
    if (!id) {
      if (required) throw new Error(`Missing required option: ${name}`);
      return null;
    }
    return this.guildId ? new DiscordRole(this.client, this.guildId, id) : new DiscordUser(this.client, id);
  }

  private resourceOption<T>(
    name: string,
    required: boolean,
    create: (id: string) => T,
  ): T | null {
    const option = this.options.find((candidate) => candidate.name === name);
    const id = typeof option?.value === "string" ? option.value : null;
    if (!id) {
      if (required) throw new Error(`Missing required option: ${name}`);
      return null;
    }
    return create(id);
  }

  getSubcommand(required = true): string | null {
    const group = this.options.find((candidate) => candidate.type === 2);
    const option = (group?.options as Json[] | undefined)?.find((candidate) => candidate.type === 1)
      ?? this.options.find((candidate) => candidate.type === 1);
    if (typeof option?.name === "string") return option.name;
    if (required) throw new Error("This command has no selected subcommand");
    return null;
  }

  getSubcommandGroup(required = true): string | null {
    const option = this.options.find((candidate) => candidate.type === 2);
    if (typeof option?.name === "string") return option.name;
    if (required) throw new Error("This command has no selected subcommand group");
    return null;
  }

  getFocused(full = false): string | { name: string; value: string } {
    const option = this.options.find((candidate) => candidate.focused);
    const value = typeof option?.value === "string" ? option.value : "";
    return full ? { name: String(option?.name ?? ""), value } : value;
  }
}
