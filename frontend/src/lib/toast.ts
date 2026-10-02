import { create } from "zustand";

export type ToastKind = "success" | "error";

export type Toast = { id: number; kind: ToastKind; message: string };

/** How long each kind stays up. Errors stay longer: they may need reading twice. */
export const TOAST_DURATION_MS: Record<ToastKind, number> = {
  success: 5000,
  error: 9000,
};

/** Older toasts are dropped beyond this, so a burst of failures can't fill the screen. */
const MAX_TOASTS = 4;

type ToastState = {
  toasts: Toast[];
  show: (kind: ToastKind, message: string) => number;
  dismiss: (id: number) => void;
};

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (kind, message) => {
    const id = nextId++;
    set((state) => ({
      toasts: [...state.toasts.filter((t) => t.message !== message), { id, kind, message }].slice(
        -MAX_TOASTS
      ),
    }));
    setTimeout(() => get().dismiss(id), TOAST_DURATION_MS[kind]);
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/**
 * Short-lived feedback for an action whose result isn't otherwise visible
 * where the user is looking (a list row's button, a copy, a background job).
 * Errors about a form being filled in belong next to that form instead.
 */
export const toast = {
  success: (message: string) => useToastStore.getState().show("success", message),
  error: (message: string) => useToastStore.getState().show("error", message),
};
