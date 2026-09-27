import { z } from 'zod';
import type { FastifyBaseLogger, FastifySerializerCompiler } from 'fastify';

/** A route returned data its response schema doesn't describe. */
export class ResponseContractError extends Error {
  constructor(
    public readonly method: string,
    public readonly url: string,
    public readonly issues: z.core.$ZodIssue[],
  ) {
    super(
      `Response for ${method} ${url} does not match its contract: ` +
        issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; '),
    );
    this.name = 'ResponseContractError';
  }
}

function isZodSchema(schema: unknown): schema is z.ZodType {
  return typeof schema === 'object' && schema !== null && '_zod' in schema;
}

/**
 * Serializes every response through its route's Zod schema (encode direction:
 * Dates become ISO strings, fields the contract doesn't list are dropped).
 *
 * A mismatch is a bug in the route or the contract. With `strict` (dev, test,
 * CI) it fails the request so the bug surfaces immediately. In production it
 * is logged and the unfiltered response is sent, so a contract slip can't take
 * a live instance's feature down.
 */
export function createContractSerializer(
  log: FastifyBaseLogger,
  strict: boolean,
): FastifySerializerCompiler<unknown> {
  return ({ schema, method, url }) => {
    if (!isZodSchema(schema)) return (data) => JSON.stringify(data);
    return (data) => {
      const result = z.safeEncode(schema, data);
      if (result.success) return JSON.stringify(result.data);
      const error = new ResponseContractError(method, url, result.error.issues);
      if (strict) throw error;
      log.error({ err: error }, error.message);
      return JSON.stringify(data);
    };
  };
}
