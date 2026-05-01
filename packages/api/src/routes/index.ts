import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth.js';
import { userRoutes } from './users.js';
import { projectRoutes } from './projects.js';
import { sectionRoutes } from './sections.js';
import { taskRoutes } from './tasks.js';
import { labelRoutes } from './labels.js';
import { filterRoutes } from './filters.js';
import { viewRoutes } from './views.js';
import { commentRoutes } from './comments.js';
import { activityRoutes } from './activity.js';
import { workspaceRoutes } from './workspaces.js';
import { reminderRoutes } from './reminders.js';
import { notificationRoutes } from './notifications.js';
import { searchRoutes } from './search.js';

export async function registerRoutes(app: FastifyInstance) {
  app.register(authRoutes, { prefix: '/api/v1/auth' });
  app.register(userRoutes, { prefix: '/api/v1/users' });
  app.register(workspaceRoutes, { prefix: '/api/v1/workspaces' });
  app.register(projectRoutes, { prefix: '/api/v1/projects' });
  app.register(sectionRoutes, { prefix: '/api/v1' });
  app.register(taskRoutes, { prefix: '/api/v1/tasks' });
  app.register(labelRoutes, { prefix: '/api/v1/labels' });
  app.register(filterRoutes, { prefix: '/api/v1/filters' });
  app.register(viewRoutes, { prefix: '/api/v1/views' });
  app.register(commentRoutes, { prefix: '/api/v1' });
  app.register(activityRoutes, { prefix: '/api/v1' });
  app.register(reminderRoutes, { prefix: '/api/v1' });
  app.register(notificationRoutes, { prefix: '/api/v1' });
  app.register(searchRoutes, { prefix: '/api/v1/search' });
}
