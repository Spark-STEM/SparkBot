type Json = Record<string, unknown>;

/** Builds allowed-mentions message options. */
export class AllowedMentionsBuilder {
  private readonly data: Json = {};
  parse(...types: ("roles" | "users" | "everyone")[]) { this.data.parse = types; return this; }
  users(...ids: string[]) { this.data.users = ids; return this; }
  roles(...ids: string[]) { this.data.roles = ids; return this; }
  repliedUser(value = true) { this.data.replied_user = value; return this; }
  toJSON() { return this.data; }
}
