import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../utils/jwt.js';
import { UnauthorizedError } from '../errors/index.js';

export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid authorization header');
  }

  const token = authHeader.slice(7);
  const payload = verifyAccessToken(token);

  if (!payload) {
    throw new UnauthorizedError('Invalid or expired access token');
  }

  request.user = {
    id: payload.id,
    email: payload.email,
    name: payload.name,
  };
}
