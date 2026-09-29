import { useMemo, useSyncExternalStore } from "react";

const TOKEN_KEY = "forma_token";
const USER_KEY = "forma_user";

export type OrgRole = "OWNER" | "ADMIN" | "MEMBER";

export type AuthUser = {
  id: string;
  email: string;
  role: OrgRole;
  orgId: string;
  name?: string | null;
  /** Absent in sessions stored before verification existed. */
  emailVerified?: boolean;
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

/*
 * Mirrors of the server's rules in backend/src/utils/orgRoles.ts. They only
 * decide which controls to show; the server enforces the rules either way.
 */

export const ROLE_LABELS: Record<OrgRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
};

export const canManageMembers = (user?: AuthUser | null) => canManageBilling(user);

/** Roles this user may invite someone at. Ownership is granted by role change. */
export const invitableRoles = (user?: AuthUser | null): OrgRole[] => {
  if (user?.role === "OWNER") return ["ADMIN", "MEMBER"];
  if (user?.role === "ADMIN") return ["MEMBER"];
  return [];
};

export const canChangeRoles = (user?: AuthUser | null) => user?.role === "OWNER";

export const canRemoveMember = (
  user: AuthUser | null | undefined,
  target: { id: string; role: OrgRole }
) => {
  if (!user || user.id === target.id) return false;
  if (user.role === "OWNER") return true;
  return user.role === "ADMIN" && target.role === "MEMBER";
};
