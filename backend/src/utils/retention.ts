/**
 * Pure date math for the maintenance jobs, kept apart from the Prisma calls
 * that use it so the cutoff logic is verifiable without a database.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Rows dated before this cutoff are old enough to delete. */
export const retentionCutoff = (retentionDays: number, now = new Date()): Date =>
  new Date(now.getTime() - retentionDays * DAY_MS);
