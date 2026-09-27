import { z } from 'zod';

/**
 * A point in time. On the wire it is an ISO 8601 string (what JSON.stringify
 * does to a Date); on the server it is a Date. As a codec, the server returns
 * Dates straight from Prisma and the serializer encodes them, while clients'
 * types (z.input) see the string they actually receive.
 */
export const instant = z.codec(z.iso.datetime(), z.date(), {
  decode: (iso) => new Date(iso),
  encode: (date) => date.toISOString(),
});

export const id = z.string().min(1);

/** Free-form JSON stored as-is (template bodies, activity snapshots). */
export const json = z.unknown();

/** The success envelope every JSON endpoint uses: `{ success: true, data }`. */
export function ok<T extends z.ZodType>(data: T) {
  return z.object({ success: z.literal(true), data });
}

/** A cursor-paginated success envelope: `{ success: true, data, nextCursor }`. */
export function page<T extends z.ZodType>(item: T) {
  return z.object({
    success: z.literal(true),
    data: z.array(item),
    nextCursor: z.string().nullable(),
  });
}

/** Endpoints that only confirm an action: `{ success: true, message }`. */
export const messageResponse = z.object({
  success: z.literal(true),
  message: z.string(),
});

/** Every error response: `{ success: false, error: CODE, message }`. */
export const errorResponse = z.object({
  success: z.literal(false),
  error: z.string(),
  message: z.string(),
});

/** What a client receives: the wire (input) side of a schema. */
export type Wire<T extends z.ZodType> = z.input<T>;
