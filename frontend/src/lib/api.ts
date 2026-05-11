const DEFAULT_API_BASE = "http://localhost:5001";

export const getApiBaseUrl = () =>
  process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE;

export const apiFetch = (path: string, init?: RequestInit) => {
  const base = getApiBaseUrl();
  return fetch(`${base}${path}`, init);
};
