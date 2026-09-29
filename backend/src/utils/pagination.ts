import type { Pagination } from "../validation/common";

export type Page<T> = { items: T[]; nextCursor: string | null };

/**
 * Prisma arguments for one page: one row more than asked for, so `pageOf` can
 * tell whether another page follows. Callers must also order by `id` last, so
 * rows with equal sort keys keep a stable order across pages.
 */
export const pageArgs = ({ limit, cursor }: Pagination) => ({
  take: limit + 1,
  ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
});

export const pageOf = <T extends { id: string }>(rows: T[], limit: number): Page<T> => {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items, nextCursor: rows.length > limit && last ? last.id : null };
};
