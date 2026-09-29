/**
 * A client error with a message that is safe to show. Thrown from a handler,
 * the global error handler in `server.ts` answers with its status and message.
 */
export class HttpError extends Error {
  readonly expose = true;

  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 410 | 429,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}
