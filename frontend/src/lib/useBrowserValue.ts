import { useSyncExternalStore } from "react";

const neverChanges = () => () => {};

/**
 * A value that only exists in the browser (the page's origin, its query
 * string), read without a hydration mismatch: `serverValue` on the server and
 * during hydration, the real value straight after.
 *
 * `read` must return a primitive or a stable reference — it is compared
 * between renders.
 */
export const useBrowserValue = <T,>(read: () => T, serverValue: T): T =>
  useSyncExternalStore(neverChanges, read, () => serverValue);
