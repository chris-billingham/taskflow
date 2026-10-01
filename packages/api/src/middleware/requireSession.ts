import type { FastifyRequest } from 'fastify';
import { ForbiddenError } from '../errors/index.js';

/** For whole route groups (admin): refuse personal access tokens. */
export async function requireSession(request: FastifyRequest) {
  if (request.auth?.kind === 'token') {
    throw new ForbiddenError('Sign in to do this; access tokens can’t be used here');
  }
}
