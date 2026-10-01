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

/**
 * A calendar day (due dates, deadlines). On the wire it is YYYY-MM-DD; on the
 * server it is a Date at UTC midnight of that day, which is how Postgres DATE
 * columns come back from Prisma. Clients should read it as a local date, not
 * pass it to `new Date()`, which would take it as UTC midnight.
 */
export const calendarDate = z.codec(z.iso.date(), z.date(), {
  decode: (day) => new Date(`${day}T00:00:00.000Z`),
  encode: (date) => date.toISOString().slice(0, 10),
});

/**
 * A calendar day in a request: YYYY-MM-DD. A full ISO timestamp is accepted
 * for older clients and read as the date it was written on.
 */
export const calendarDateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, 'Must be a date (YYYY-MM-DD)')
  .transform((value) => value.slice(0, 10))
  .pipe(z.iso.date('Must be a real date'));

/**
 * A database enum whose stored values (Prisma @map) aren't valid enum names.
 * The server works with the names; the wire carries the stored values.
 */
function mappedEnum<const N extends string, const W extends string>(pairs: readonly (readonly [N, W])[]) {
  const names = pairs.map(([name]) => name) as [N, ...N[]];
  const wires = pairs.map(([, wire]) => wire) as [W, ...W[]];
  const byWire = new Map<W, N>(pairs.map(([name, wire]) => [wire, name]));
  const byName = new Map<N, W>(pairs.map(([name, wire]) => [name, wire]));
  return z.codec(z.enum(wires), z.enum(names), {
    decode: (wire) => byWire.get(wire)!,
    encode: (name) => byName.get(name)!,
  });
}

/** Date display format, as a date-fns pattern on the wire. */
export const dateFormatSchema = mappedEnum([
  ['MONTH_NAME', 'MMM d, yyyy'],
  ['MONTH_FIRST', 'MM/dd/yyyy'],
  ['DAY_FIRST', 'dd/MM/yyyy'],
  ['ISO', 'yyyy-MM-dd'],
]);

/** 12- or 24-hour clock. */
export const timeFormatSchema = mappedEnum([
  ['H12', '12h'],
  ['H24', '24h'],
]);

export const themeSchema = z.enum(['light', 'dark', 'system']);
export const emailFrequencySchema = z.enum(['immediate', 'daily', 'weekly']);

export const id = z.string().min(1);

/** Free-form JSON stored as-is. */
export const json = z.unknown();

/**
 * A JSON object with free-form keys (notification targets, activity
 * snapshots). Prisma types JSON columns as any JSON value, so the server side
 * is `unknown`; clients see an object, and encoding still checks it is one.
 */
export const jsonObject = z.codec(z.record(z.string(), z.unknown()), z.unknown(), {
  decode: (value) => value,
  encode: (value) => value as Record<string, unknown>,
});

/**
 * An email address as an account identity: lowercased, so "Alice@Example.com"
 * and "alice@example.com" are one person at sign-up, sign-in and invite time.
 */
export function emailAddress(message = 'Invalid email address') {
  return z.email(message).toLowerCase();
}

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

/**
 * Query parameters for a cursor-paginated list. Pass the previous response's
 * `nextCursor` as `cursor` to get the next page; a null `nextCursor` means
 * there are no more.
 */
export function pageQuery(maxLimit = 100) {
  return z.object({
    limit: z.coerce.number().int().min(1).max(maxLimit).optional(),
    cursor: z.string().min(1).optional(),
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
