import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database.js';
import { ForbiddenError, UnauthorizedError } from '../errors/index.js';

/**
 * Gate for the instance-administration surface. Registered AFTER authenticate.
 *
 * The role is re-read from the database on every admin request rather than
 * taken from the access token. Access tokens are stateless and live for 15
 * minutes, so a demoted or suspended admin who kept their tab open would
 * otherwise retain the console — including the ability to delete accounts —
 * for the remainder of that window. Admin traffic is low volume, so the extra
 * indexed lookup is the right trade for revocation being immediate.
 */
export async function requireAdmin(
  request: FastifyRequest,
  _reply: FastifyReply,
) {
  const user = await prisma.user.findUnique({
    where: { id: request.user.id },
    select: { role: true, isActive: true },
  });

  // Deleted or suspended mid-session: the token is valid but the account is not.
  if (!user || !user.isActive) {
    throw new UnauthorizedError('Your account is no longer active');
  }

  if (user.role !== 'ADMIN') {
    throw new ForbiddenError('Administrator access required');
  }
}
