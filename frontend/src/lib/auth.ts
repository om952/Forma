import { useMemo, useSyncExternalStore } from "react";

const TOKEN_KEY = "forma_token";
const USER_KEY = "forma_user";

export type AuthUser = {
  id: string;
  email: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  orgId: string;
};

export const getAuthToken = () => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(TOKEN_KEY);
};

/**
 * Fired on this tab's own sign-in and sign-out. The `storage` event only
 * reports changes made by *other* tabs.
 */
const AUTH_CHANGE_EVENT = "forma:auth-change";

const notifyAuthChange = () => window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));

export const setAuthToken = (token: string) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(TOKEN_KEY, token);
  notifyAuthChange();
};

export const clearAuthToken = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  notifyAuthChange();
};

export const setAuthUser = (user: AuthUser) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  notifyAuthChange();
};

const parseAuthUser = (raw: string | null): AuthUser | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
};

export const getAuthUser = (): AuthUser | null => {
  if (typeof window === "undefined") return null;
  return parseAuthUser(window.localStorage.getItem(USER_KEY));
};

const subscribeToAuth = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  window.addEventListener(AUTH_CHANGE_EVENT, onChange);

  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(AUTH_CHANGE_EVENT, onChange);
  };
};

/**
 * The stored session token, kept in sync across sign-in, sign-out and other
 * tabs.
 *
 * null on the server and during hydration, so the first client render matches
 * the server's HTML; the stored value follows straight after. This replaces
 * reading the token in a mount effect, which cost an extra render per page.
 */
export const useAuthToken = () =>
  useSyncExternalStore(subscribeToAuth, getAuthToken, () => null);

/** The signed-in user, with the same timing as `useAuthToken`. */
export const useAuthUser = (): AuthUser | null => {
  // The raw string is what gets compared between renders; parsing it inside
  // the snapshot would return a new object every time and loop forever.
  const raw = useSyncExternalStore(
    subscribeToAuth,
    () => window.localStorage.getItem(USER_KEY),
    () => null
  );

  return useMemo(() => parseAuthUser(raw), [raw]);
};

export const canManageBilling = (user?: AuthUser | null) => {
  if (!user) return false;
  return user.role === "OWNER" || user.role === "ADMIN";
};

export const canManageWebhooks = (user?: AuthUser | null) => canManageBilling(user);

export const canDeleteForm = (user?: AuthUser | null) => canManageBilling(user);
