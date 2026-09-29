import { useBrowserValue } from "./useBrowserValue";

/**
 * The one-time token in an emailed link, which puts it in the URL fragment
 * (`/invite#<token>`) so it is never sent to a server or written to a log.
 *
 * null until read in the browser; "" when the URL has none.
 */
export const useFragmentToken = () =>
  useBrowserValue<string | null>(() => window.location.hash.slice(1), null);
