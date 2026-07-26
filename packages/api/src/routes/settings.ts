import type { FastifyInstance } from 'fastify';
import { isValidTimeZone } from '../utils/dates.js';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import * as userService from '../services/userService.js';
import { ValidationError } from '../errors/index.js';

const updatePreferencesSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  timezone: z
    .string()
    .max(64)
    .refine(isValidTimeZone, 'Must be a valid IANA timezone (e.g. Europe/London)')
    .optional(),
  weekStart: z.number().int().min(0).max(6).optional(),
  dateFormat: z.string().max(50).nullable().optional(),
  timeFormat: z.string().max(20).nullable().optional(),
  theme: z.enum(['light', 'dark', 'system']).nullable().optional(),
});

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // PATCH /api/v1/settings/preferences
  app.patch('/preferences', async (request, reply) => {
    const result = updatePreferencesSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError(result.error.issues[0].message);
    }

    const data = await userService.updateUser(request.user.id, result.data);
    return reply.send({ success: true, data });
  });

  // GET /api/v1/settings/export
  app.get('/export', async (request, reply) => {
    const data = await userService.exportUserData(request.user.id);
    return reply
      .header('Content-Disposition', `attachment; filename="taskflow-export-${Date.now()}.json"`)
      .header('Content-Type', 'application/json')
      .send(data);
  });

  // DELETE /api/v1/settings/data
  app.delete('/data', async (request, reply) => {
    const data = await userService.deleteUser(request.user.id);
    return reply.send({ success: true, ...data });
  });
}
