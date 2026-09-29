/**
 * Naming rules for stored files, shared by the drivers and the routes. Free of
 * any config import so they can be tested on their own.
 */

/**
 * `forms/<formId>/<uuid>_<name>.<ext>` and nothing else. Keys arrive from the
 * URL, so this is also what keeps a request from naming a path outside the
 * upload directory: no dots except the one before the extension, no slashes
 * beyond the two expected.
 */
const KEY_PATTERN =
  /^forms\/[A-Za-z0-9_-]{1,64}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[A-Za-z0-9_-]{1,80}\.(png|jpg|gif|webp|pdf|docx|xlsx|txt|csv)$/;

export const isValidFileKey = (key: string) => KEY_PATTERN.test(key);

export const buildFileKey = (formId: string, fileId: string, fileName: string) =>
  `forms/${formId}/${fileId}_${fileName}`;

/** Download name shown to the user: the stored name without its uuid prefix. */
export const downloadNameFor = (key: string) =>
  key.slice(key.lastIndexOf("/") + 1).replace(/^[0-9a-f-]{36}_/, "");
