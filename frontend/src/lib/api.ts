const DEFAULT_API_BASE = "http://localhost:5001";

export const getApiBaseUrl = () =>
  process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE;

export const apiFetch = (path: string, init?: RequestInit) => {
  const base = getApiBaseUrl();
  return fetch(`${base}${path}`, init);
};

/** A failed API call, carrying the server's message, status and machine-readable code. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Calls a JSON endpoint and returns the parsed body (undefined for 204).
 * Throws an `ApiError` with the server's message for any non-2xx response.
 */
export const apiJson = async <T = unknown>(
  path: string,
  options: { method?: string; token?: string | null; body?: unknown } = {}
): Promise<T> => {
  const hasBody = options.body !== undefined;
  const response = await apiFetch(path, {
    method: options.method ?? (hasBody ? "POST" : "GET"),
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
      code?: string;
    };
    throw new ApiError(
      response.status,
      data.message || `Request failed (${response.status})`,
      data.code
    );
  }

  return response.status === 204
    ? (undefined as T)
    : ((await response.json()) as T);
};

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong";
