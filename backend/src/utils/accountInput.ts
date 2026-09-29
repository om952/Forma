/** Input rules shared by signup, login, invites and password changes. */

export const normalizeEmail = (value: string): string => value.trim().toLowerCase();

/**
 * Deliberately loose: the only real test of an address is mailing it. This
 * catches typos like a missing "@" and keeps within the 254-character limit.
 */
export const isValidEmail = (value: string): boolean =>
  value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const MIN_PASSWORD_LENGTH = 8;

/** bcrypt ignores everything past 72 bytes, so longer passwords are refused rather than silently cut short. */
export const MAX_PASSWORD_LENGTH = 72;

/**
 * Why `value` is not an acceptable password, or null if it is. Phrased to
 * follow the field's name: "password must be at least 8 characters".
 */
export const passwordProblem = (value: unknown): string | null => {
  if (typeof value !== "string" || value.length === 0) {
    return "is required";
  }

  if (value.length < MIN_PASSWORD_LENGTH) {
    return `must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }

  if (Buffer.byteLength(value, "utf8") > MAX_PASSWORD_LENGTH) {
    return `must be at most ${MAX_PASSWORD_LENGTH} bytes`;
  }

  return null;
};

export const toSlug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
