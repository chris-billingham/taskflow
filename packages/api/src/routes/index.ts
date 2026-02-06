import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth.js';
import { userRoutes } from './users.js';
import { projectRoutes } from './projects.js';
import { sectionRoutes } from './sections.js';
import { taskRoutes } from './tasks.js';
import { labelRoutes } from './labels.js';
import { filterRoutes } from './filters.js';

export async function registerRoutes(app: FastifyInstance) {
  app.register(authRoutes, { prefix: '/api/v1/auth' });
  app.register(userRoutes, { prefix: '/api/v1/users' });
  app.register(projectRoutes, { prefix: '/api/v1/projects' });
  app.register(sectionRoutes, { prefix: '/api/v1' });
  app.register(taskRoutes, { prefix: '/api/v1/tasks' });
  app.register(labelRoutes, { prefix: '/api/v1/labels' });
  app.register(filterRoutes, { prefix: '/api/v1/filters' });
}
