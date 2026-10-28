import type { Env } from "../types.ts";

export interface Webhook {
  pathname: `/${string}`;
  handler: (request: Request, env: Env) => Response | Promise<Response>;
}
