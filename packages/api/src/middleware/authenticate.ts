import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../utils/jwt.js';
import { ForbiddenError, UnauthorizedError } from '../errors/index.js';
import { API_TOKEN_PREFIX, resolveApiToken } from '../services/sessionService.js';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Accepts a session's access token (a JWT) or a personal access token
 * ("tfp_…"). Personal access tokens can't reach routes marked sessionOnly
 * (passwords, sessions, tokens, account deletion, admin), and READ tokens
 * can only make read requests.
 */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid authorization header');
  }
  const token = authHeader.slice(7);

  if (token.startsWith(API_TOKEN_PREFIX)) {
    const resolved = await resolveApiToken(token);
    if (!resolved) throw new UnauthorizedError('Invalid, expired or revoked access token');
    if (request.routeOptions.config?.sessionOnly) {
      throw new ForbiddenError('Sign in to do this; access tokens can’t manage your account');
    }
    if (resolved.scope === 'READ' && !READ_METHODS.has(request.method)) {
      throw new ForbiddenError('This access token is read-only');
    }
    const { id, email, name } = resolved.user;
    request.user = { id, email, name };
    request.auth = { kind: 'token', scope: resolved.scope, tokenId: resolved.tokenId };
    return;
  }

  const payload = verifyAccessToken(token);
  if (!payload) {
    throw new UnauthorizedError('Invalid or expired access token');
  }

  request.user = {
    id: payload.id,
    email: payload.email,
    name: payload.name,
    sid: payload.sid,
  };
  request.auth = { kind: 'session' };
}
