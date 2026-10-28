import type { Env } from "../../types.ts";
import type { SlashCommand } from "../../slashcommands/types.ts";
import type { FileUpload, Json } from "../types/common.ts";
import type { RequestBody } from "../types/common.ts";
import { assertFileUpload } from "../types/validation.ts";

/** Common Discord REST error codes. */
export enum DiscordErrorCode {
  UnknownMessage = 10008,
  UnknownChannel = 10003,
  UnknownGuild = 10004,
  MissingPermissions = 50013,
  InvalidFormBody = 50035,
}

/** Structured Discord REST failure including rate-limit metadata. */
export class DiscordApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly method: string,
    readonly route: string,
    readonly body: string,
    readonly retryAfter?: number,
    readonly code?: number,
    readonly errors?: Json,
    readonly headers?: Record<string, string>,
  ) { super(message); }

  get isRateLimited(): boolean { return this.status === 429; }
}

export interface RequestOptions {
  /** Aborts the request when the signal is cancelled. */
  signal?: AbortSignal;
  /** Number of automatic retries for HTTP 429 responses. */
  retries?: number;
  /** Allows retries for non-idempotent methods such as POST. */
  retryNonIdempotent?: boolean;
  /** Aborts the request after this many milliseconds. */
  timeoutMs?: number;
  /** Sends an idempotency key and permits safe retries for this request. */
  idempotencyKey?: string;
  /** Reuses an in-flight GET request for the same route and body. */
  deduplicate?: boolean;
}

export interface RestRequestContext {
  method: string;
  route: string;
  attempt: number;
  headers: Readonly<Record<string, string>>;
}

export interface RestResponseContext {
  method: string;
  route: string;
  status: number;
  headers: Readonly<Record<string, string>>;
  durationMs: number;
  retryAfter?: number;
  rateLimit?: RateLimitState;
}

export interface RestMiddleware {
  onRequest?(context: RestRequestContext): void | Promise<void>;
  onResponse?(context: RestResponseContext): void | Promise<void>;
  onError?(error: unknown, context: RestRequestContext): void | Promise<void>;
}

/** Current rate-limit information for a Discord route bucket. */
export interface RateLimitState {
  bucket?: string;
  limit?: number;
  remaining?: number;
  resetAt?: Date;
  retryAfter?: number;
}
export interface RequestDiagnostic {
  method: string;
  route: string;
  status?: number;
  attempt: number;
  durationMs: number;
  retryAfter?: number;
  error?: string;
}

/** Performs authenticated Discord REST requests in a Cloudflare Worker. */
export class DiscordRestClient {
  private globalRateLimitUntil = 0;
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly rateLimitBuckets = new Map<string, RateLimitState>();
  private readonly diagnostics: RequestDiagnostic[] = [];
  constructor(
    readonly env: Env,
    readonly commands: readonly SlashCommand[],
    private readonly middleware: readonly RestMiddleware[] = [],
  ) {}

  /** Returns a copy of the current rate-limit state for a route. */
  getRateLimit(route: string): RateLimitState | undefined {
    const state = this.rateLimitBuckets.get(route);
    return state ? { ...state } : undefined;
  }
  getDiagnostics(): readonly RequestDiagnostic[] { return this.diagnostics.slice(); }

  /**
   * Sends a request to Discord's v10 REST API.
   *
   * Errors include the method, route, HTTP status, and response body so command
   * handlers can surface an actionable failure instead of a silent fallback.
   */
  async request<T = Json>(
    method: string,
    route: string,
    body?: RequestBody,
    headers: Record<string, string> = {},
    options: RequestOptions = {},
  ): Promise<T> {
    if (!this.env.DISCORD_TOKEN) throw new Error("DISCORD_TOKEN is not configured");
    if (!method || !route.startsWith("/")) throw new Error("Discord REST requests require a method and an absolute API route.");
    const requestHeaders: Record<string, string> = {
      Authorization: `Bot ${this.env.DISCORD_TOKEN}`,
      ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...headers,
    };
    if (options.idempotencyKey) requestHeaders["X-Idempotency-Key"] = options.idempotencyKey;
    const dedupeKey = `${method.toUpperCase()}:${route}:${body === undefined ? "" : JSON.stringify(body)}`;
    if (options.deduplicate && method.toUpperCase() === "GET") {
      const existing = this.inFlight.get(dedupeKey);
      if (existing) return existing as Promise<T>;
    }
    const operation = this.requestInternal<T>(method, route, body, requestHeaders, options);
    if (options.deduplicate && method.toUpperCase() === "GET") {
      this.inFlight.set(dedupeKey, operation);
      operation.finally(() => this.inFlight.delete(dedupeKey)).catch(() => undefined);
    }
    return operation;
  }

  private async requestInternal<T>(
    method: string,
    route: string,
    body: RequestBody | undefined,
    requestHeaders: Record<string, string>,
    options: RequestOptions,
  ): Promise<T> {
    const requestBody = body === undefined || typeof body === "string" ||
      body instanceof ArrayBuffer || body instanceof FormData
      ? body
      : JSON.stringify(body);
    const retries = options.retries ?? 3;
    const retryableMethod = ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"].includes(method.toUpperCase())
      || options.retryNonIdempotent === true
      || options.idempotencyKey !== undefined;
    for (let attempt = 0; ; attempt++) {
      const waitForGlobalLimit = this.globalRateLimitUntil - Date.now();
      if (waitForGlobalLimit > 0) await new Promise<void>((resolve) => setTimeout(resolve, waitForGlobalLimit));
      const timeoutController = options.timeoutMs !== undefined ? new AbortController() : undefined;
      const timeout = timeoutController && setTimeout(() => timeoutController.abort(), options.timeoutMs);
      const signal = options.signal && timeoutController
        ? AbortSignal.any([options.signal, timeoutController.signal])
        : timeoutController?.signal ?? options.signal;
      const requestContext = { method, route, attempt, headers: requestHeaders };
      await Promise.all(this.middleware.map((item) => item.onRequest?.(requestContext)));
      const startedAt = Date.now();
      let response: Response;
      try {
        response = await fetch(`https://discord.com/api/v10${route}`, {
          method, headers: requestHeaders, body: requestBody, signal,
        });
      } catch (error) {
        await Promise.all(this.middleware.map((item) => item.onError?.(error, requestContext)));
        throw error;
      }
      if (timeout) clearTimeout(timeout);
      const text = await response.text();
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => { responseHeaders[key] = value; });
      const rateLimit = this.updateRateLimit(route, responseHeaders);
      this.recordDiagnostic({ method, route, attempt, status: response.status,
        durationMs: Date.now() - startedAt, retryAfter: rateLimit?.retryAfter });
      await Promise.all(this.middleware.map((item) => item.onResponse?.({
        method, route, status: response.status, headers: responseHeaders,
        durationMs: Date.now() - startedAt, rateLimit,
        retryAfter: rateLimit?.retryAfter,
      })));
      if (response.ok) return text ? JSON.parse(text) as T : {} as T;

      const retryAfterHeader = response.headers.get("retry-after");
      let retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
      if (response.status === 429 && retryAfter === undefined) {
        try {
          const parsed = JSON.parse(text) as Json;
          if (typeof parsed.retry_after === "number") retryAfter = parsed.retry_after;
        } catch {
          // The structured error below retains the original response body.
        }

      }
      let globalRateLimit = false;
      try {
        const parsed = JSON.parse(text) as Json;
        globalRateLimit = parsed.global === true;
      } catch {
        // The structured error below retains the original response body.
      }

      if (globalRateLimit && retryAfter !== undefined) {
        this.globalRateLimitUntil = Math.max(this.globalRateLimitUntil, Date.now() + retryAfter * 1000);
      }
      if (response.status === 429 && retryableMethod && attempt < retries && retryAfter !== undefined) {
        await new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, retryAfter!) * 1000));
        continue;
      }
      let code: number | undefined;
      let errors: Json | undefined;
      try {
        const parsed = JSON.parse(text) as Json;
        if (typeof parsed.code === "number") code = parsed.code;
        if (parsed.errors && typeof parsed.errors === "object") errors = parsed.errors as Json;
      } catch {
        // Preserve non-JSON response bodies in DiscordApiError.body.
      }
      const apiError = new DiscordApiError(
        `Discord API ${method} ${route} failed (${response.status}): ${text}`,
        response.status, method, route, text, retryAfter, code, errors, responseHeaders,
      );
      await Promise.all(this.middleware.map((item) => item.onError?.(apiError, requestContext)));
      throw apiError;
    }
  }

  private recordDiagnostic(diagnostic: RequestDiagnostic): void {
    this.diagnostics.push(diagnostic);
    if (this.diagnostics.length > 100) this.diagnostics.shift();
  }

  private updateRateLimit(route: string, headers: Record<string, string>): RateLimitState | undefined {
    const bucket = headers["x-ratelimit-bucket"];
    const limit = Number(headers["x-ratelimit-limit"]);
    const remaining = Number(headers["x-ratelimit-remaining"]);
    const resetAfter = Number(headers["x-ratelimit-reset-after"]);
    const retryAfter = Number(headers["retry-after"]);
    if (!bucket && !Number.isFinite(limit) && !Number.isFinite(remaining)) return this.rateLimitBuckets.get(route);
    const current: RateLimitState = {
      ...(bucket ? { bucket } : {}),
      ...(Number.isFinite(limit) ? { limit } : {}),
      ...(Number.isFinite(remaining) ? { remaining } : {}),
      ...(Number.isFinite(resetAfter) ? { resetAt: new Date(Date.now() + resetAfter * 1000) } : {}),
      ...(Number.isFinite(retryAfter) ? { retryAfter } : {}),
    };
    this.rateLimitBuckets.set(route, current);
    return current;
  }

  /** Sends a request with an AbortSignal created from a timeout. */
  requestWithTimeout<T = Json>(
    method: string,
    route: string,
    options: { timeoutMs: number; body?: RequestBody; headers?: Record<string, string>; request?: RequestOptions },
  ): Promise<T> {
    return this.request<T>(method, route, options.body, options.headers, {
      ...options.request,
      timeoutMs: options.timeoutMs,
    });
  }

  /** Sends a JSON payload and files using Discord's multipart form format. */
  requestMultipart<T = Json>(
    method: string,
    route: string,
    payload: Json,
    files: FileUpload[],
    headers: Record<string, string> = {},
    options: RequestOptions = {},
  ): Promise<T> {
    if (files.length === 0) return this.request<T>(method, route, payload, headers, options);
    const form = new FormData();
    const { files: _files, ...jsonPayload } = payload as Json & { files?: unknown };
    files.forEach(assertFileUpload);
    const existingAttachments = Array.isArray(jsonPayload.attachments)
      ? jsonPayload.attachments as unknown[]
      : [];
    jsonPayload.attachments = [
      ...existingAttachments,
      ...files.map((file, index) => ({
        id: existingAttachments.length + index,
        filename: file.name,
        ...(file.description ? { description: file.description } : {}),
        ...(file.spoiler ? { spoiler: true } : {}),
      })),
    ];
    form.append("payload_json", JSON.stringify(jsonPayload));
    files.forEach((file, index) => {
      const data = typeof file.data === "string"
        ? new Blob([file.data])
        : file.data instanceof ArrayBuffer ? new Blob([new Uint8Array(file.data)]) : file.data;
      form.append(`files[${index}]`, data, file.name);
    });
    return this.request<T>(method, route, form, headers, options);
  }
}
