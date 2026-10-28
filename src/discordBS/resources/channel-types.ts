import { DiscordChannel } from "./channel.ts";

/** Text-capable channel resource. */
export class DiscordTextChannel extends DiscordChannel {}
/** Voice channel resource. */
export class DiscordVoiceChannel extends DiscordChannel {}
/** Stage channel resource. */
export class DiscordStageChannel extends DiscordChannel {}
/** Forum channel resource. */
export class DiscordForumChannel extends DiscordChannel {}
/** Thread channel resource. */
export class DiscordThreadChannel extends DiscordChannel {}
/** Category channel resource. */
export class DiscordCategoryChannel extends DiscordChannel {}
