/**
 * A client error with a message that is safe to show. Thrown from a handler,
 * the global error handler in `server.ts` answers with its status and message,
 * plus `details` (such as per-field validation issues) when present.
 */
export class HttpError extends Error {
  readonly expose = true;

  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 410 | 413 | 415 | 429,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "HttpError";
  }
}
