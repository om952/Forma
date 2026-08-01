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

export const setAuthToken = (token: string) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(TOKEN_KEY, token);
};

export const clearAuthToken = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
};

export const setAuthUser = (user: AuthUser) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const getAuthUser = (): AuthUser | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
};

export const canManageBilling = (user?: AuthUser | null) => {
  if (!user) return false;
  return user.role === "OWNER" || user.role === "ADMIN";
};

export const canManageWebhooks = (user?: AuthUser | null) => canManageBilling(user);

export const canDeleteForm = (user?: AuthUser | null) => canManageBilling(user);
