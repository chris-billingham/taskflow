/**
 * Cursor pagination over Prisma, shared by every list endpoint so they page
 * the same way: fetch one row more than asked for to learn whether another
 * page exists, and hand back the last row's id as the next cursor.
 *
 * The query's orderBy must end in a unique column (id) so the order is total;
 * otherwise rows that tie on the sort keys can be skipped or repeated across
 * pages.
 */
export function cursorArgs(limit: number, cursor?: string) {
  return {
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  };
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export function toPage<T extends { id: string }>(rows: T[], limit: number): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}
