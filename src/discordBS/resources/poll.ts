import { DiscordResource } from "./base.ts";
import type { DiscordRestClient } from "../rest/client.ts";
import type { Json } from "../types/common.ts";

/** A poll answer and its current vote count. */
export interface PollAnswer {
  id: number;
  text: string | null;
  count: number;
  meVoted: boolean;
}

/** Poll results attached to a Discord message. */
export class DiscordPoll extends DiscordResource<Json, DiscordPoll> {
  get question(): string | null {
    const question = this.data?.question;
    return question && typeof question === "object" && typeof (question as Json).text === "string"
      ? (question as Json).text as string
      : null;
  }
  get answers(): PollAnswer[] {
    const answers = this.data?.answers;
    if (!Array.isArray(answers)) return [];
    return answers.map((answer) => {
      const item = answer as Json;
      const media = item.poll_media && typeof item.poll_media === "object" ? item.poll_media as Json : {};
      return {
        id: typeof item.answer_id === "number" ? item.answer_id : 0,
        text: typeof media.text === "string" ? media.text : null,
        count: typeof item.votes === "number" ? item.votes : 0,
        meVoted: item.me_voted === true,
      };
    });
  }
  get duration(): number | null { return typeof this.data?.duration === "number" ? this.data.duration : null; }
  get allowMultiselect(): boolean { return this.data?.allow_multiselect === true; }

  constructor(client: DiscordRestClient, private readonly channelId: string, private readonly messageId: string, data?: Json) {
    super(client, messageId, `/channels/${channelId}/polls/${messageId}`, data);
  }

  /** Fetches the latest poll results. */
  override fetch(): Promise<DiscordPoll> {
    return this.client.request<Json>("GET", this.route)
      .then((poll) => new DiscordPoll(this.client, this.channelId, this.messageId, poll));
  }
  /** Votes for an answer. */
  vote(answerId: number): Promise<void> {
    if (!Number.isInteger(answerId) || answerId < 1) throw new Error("A valid poll answer ID is required.");
    return this.client.request<void>("POST", `${this.route}/answers/${answerId}`);
  }
  /** Removes the current user's vote from an answer. */
  removeVote(answerId: number): Promise<void> {
    if (!Number.isInteger(answerId) || answerId < 1) throw new Error("A valid poll answer ID is required.");
    return this.client.request<void>("DELETE", `${this.route}/answers/${answerId}`);
  }
  /** Ends the poll. */
  end(): Promise<void> { return this.client.request<void>("POST", `${this.route}/expire`); }
}
