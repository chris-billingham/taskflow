export const openapiSpec = {
  openapi: '3.0.3',
  // NOTE: this spec covers the primary resources; sections, comments,
  // filters, views, reminders, activity and attachments are implemented but
  // not yet documented here. Treat the Zod schemas in src/schemas as the
  // source of truth.
  info: {
    title: 'Taskflow API',
    version: '1.0.0',
    description: `
Taskflow is a self-hosted task management API. All endpoints (except auth) require a valid JWT access token.

## Authentication

Pass the access token as a Bearer token:
\`\`\`
Authorization: Bearer <access_token>
\`\`\`

Tokens are returned from \`POST /api/v1/auth/login\`. Access tokens expire after 15 minutes; use the refresh endpoint to obtain a new one.

## Errors

All errors follow the same shape:
\`\`\`json
{ "success": false, "error": "ERROR_CODE", "message": "Human readable message" }
\`\`\`

Common HTTP status codes:
- \`400\` — validation error
- \`401\` — missing or invalid token
- \`403\` — forbidden (insufficient permissions)
- \`404\` — resource not found
- \`409\` — conflict (e.g. duplicate email)
- \`500\` — internal server error
    `.trim(),
    contact: {
      name: 'Taskflow',
      url: 'https://github.com/your-org/taskflow',
    },
    license: { name: 'MIT' },
  },
  servers: [
    { url: 'http://localhost:3001', description: 'Local development' },
    { url: 'https://your-domain.example.com', description: 'Production' },
  ],
  tags: [
    { name: 'Auth', description: 'Registration, login, token management, password reset' },
    { name: 'Users', description: 'User profile operations' },
    { name: 'Workspaces', description: 'Workspace management and member invitations' },
    { name: 'Projects', description: 'Project CRUD' },
    { name: 'Sections', description: 'Project sections / columns' },
    { name: 'Tasks', description: 'Task CRUD, completion, reordering, bulk operations' },
    { name: 'Labels', description: 'Label management' },
    { name: 'Filters', description: 'Saved filters' },
    { name: 'Views', description: 'View configurations (list, board, calendar)' },
    { name: 'Comments', description: 'Task comments' },
    { name: 'Activity', description: 'Activity log' },
    { name: 'Reminders', description: 'Task reminders' },
    { name: 'Notifications', description: 'In-app notifications and push subscriptions' },
    { name: 'Search', description: 'Full-text search across tasks, projects, and comments' },
    { name: 'Settings', description: 'User settings and preferences' },
    { name: 'Templates', description: 'Task templates' },
    { name: 'Attachments', description: 'File attachments (S3/MinIO)' },
    {
      name: 'Admin',
      description:
        'Instance administration: the account lifecycle for the whole deployment. ' +
        'Requires SystemRole.ADMIN, re-checked against the database on every request. ' +
        'Grants no access to other users’ tasks, projects or comments.',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: { type: 'string', example: 'VALIDATION_ERROR' },
          message: { type: 'string', example: 'Task content is required' },
        },
      },
      Task: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          content: { type: 'string', example: 'Buy groceries' },
          description: { type: 'string', nullable: true },
          projectId: { type: 'string' },
          sectionId: { type: 'string', nullable: true },
          parentId: { type: 'string', nullable: true },
          dueDate: { type: 'string', format: 'date', nullable: true },
          dueTime: { type: 'string', example: '14:30', nullable: true },
          deadline: { type: 'string', format: 'date', nullable: true },
          duration: { type: 'integer', description: 'Duration in minutes', nullable: true },
          priority: { type: 'integer', minimum: 1, maximum: 4, description: '1=urgent, 4=none' },
          isCompleted: { type: 'boolean' },
          completedAt: { type: 'string', format: 'date-time', nullable: true },
          sortOrder: { type: 'integer' },
          assigneeId: { type: 'string', nullable: true },
          isRecurring: { type: 'boolean' },
          recurrenceRule: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Project: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          color: { type: 'string', example: '#3b82f6' },
          description: { type: 'string', nullable: true },
          workspaceId: { type: 'string' },
          ownerId: { type: 'string' },
          isArchived: { type: 'boolean' },
          sortOrder: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          avatarUrl: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Label: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          color: { type: 'string', example: '#ef4444' },
          authorId: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Comment: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          content: { type: 'string' },
          taskId: { type: 'string' },
          userId: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        security: [],
        responses: {
          200: {
            description: 'All services healthy',
            content: {
              'application/json': {
                example: {
                  status: 'ok',
                  version: '1.0.0',
                  timestamp: '2024-01-01T00:00:00.000Z',
                  checks: { database: 'ok', redis: 'ok' },
                },
              },
            },
          },
          503: { description: 'One or more services degraded' },
        },
      },
    },
    '/api/v1/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new user',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'name'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                  name: { type: 'string', minLength: 1 },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'User created, tokens returned' },
          409: { description: 'Email already in use' },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Login successful',
            content: {
              'application/json': {
                example: {
                  success: true,
                  data: { accessToken: '<jwt>', user: { id: '...', email: 'user@example.com' } },
                },
              },
            },
          },
          401: { description: 'Invalid credentials' },
        },
      },
    },
    '/api/v1/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Log out (invalidates refresh token)',
        responses: { 200: { description: 'Logged out' } },
      },
    },
    '/api/v1/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Refresh access token',
        security: [],
        responses: {
          200: { description: 'New access token returned' },
          401: { description: 'Invalid or expired refresh token' },
        },
      },
    },
    '/api/v1/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Send password reset email',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: { email: { type: 'string', format: 'email' } },
              },
            },
          },
        },
        responses: { 200: { description: 'Email sent (always 200 to prevent user enumeration)' } },
      },
    },
    '/api/v1/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Reset password with token from email',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token', 'password'],
                properties: {
                  token: { type: 'string' },
                  password: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Password reset successful' },
          400: { description: 'Invalid or expired token' },
        },
      },
    },
    '/api/v1/tasks': {
      get: {
        tags: ['Tasks'],
        summary: 'List tasks with optional filters',
        parameters: [
          { name: 'projectId', in: 'query', schema: { type: 'string' } },
          { name: 'sectionId', in: 'query', schema: { type: 'string' } },
          { name: 'completed', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
          { name: 'priority', in: 'query', schema: { type: 'string' }, description: 'Comma-separated: 1,2' },
          { name: 'assigneeId', in: 'query', schema: { type: 'string' } },
          { name: 'labels', in: 'query', schema: { type: 'string' }, description: 'Comma-separated label IDs' },
          { name: 'dueDateFrom', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'dueDateTo', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Task list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { type: 'array', items: { $ref: '#/components/schemas/Task' } },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Tasks'],
        summary: 'Create a task',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['content', 'projectId'],
                properties: {
                  content: { type: 'string', minLength: 1, maxLength: 500 },
                  description: { type: 'string', maxLength: 10000 },
                  projectId: { type: 'string' },
                  sectionId: { type: 'string' },
                  parentId: { type: 'string' },
                  dueDate: { type: 'string', format: 'date' },
                  dueTime: { type: 'string', example: '14:30' },
                  priority: { type: 'integer', minimum: 1, maximum: 4 },
                  assigneeId: { type: 'string' },
                  labelIds: { type: 'array', items: { type: 'string' } },
                  isRecurring: { type: 'boolean' },
                  recurrenceRule: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Task created' },
          400: { $ref: '#/components/schemas/Error' },
        },
      },
    },
    '/api/v1/tasks/{id}': {
      get: {
        tags: ['Tasks'],
        summary: 'Get task by ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Task details' },
          404: { description: 'Task not found' },
        },
      },
      patch: {
        tags: ['Tasks'],
        summary: 'Update a task',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Task' },
            },
          },
        },
        responses: { 200: { description: 'Updated task' }, 404: { description: 'Not found' } },
      },
      delete: {
        tags: ['Tasks'],
        summary: 'Delete a task',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' }, 404: { description: 'Not found' } },
      },
    },
    '/api/v1/tasks/{id}/complete': {
      post: {
        tags: ['Tasks'],
        summary: 'Mark task complete',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Task completed' } },
      },
    },
    '/api/v1/tasks/{id}/uncomplete': {
      post: {
        tags: ['Tasks'],
        summary: 'Mark task incomplete',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Task uncompleted' } },
      },
    },
    '/api/v1/tasks/{id}/move': {
      post: {
        tags: ['Tasks'],
        summary: 'Move task to another project/section',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  projectId: { type: 'string' },
                  sectionId: { type: 'string', nullable: true },
                  parentId: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Task moved' } },
      },
    },
    '/api/v1/tasks/{id}/duplicate': {
      post: {
        tags: ['Tasks'],
        summary: 'Duplicate a task',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Duplicated task' } },
      },
    },
    '/api/v1/tasks/quick-add': {
      post: {
        tags: ['Tasks'],
        summary: 'Quick add via natural language',
        description: 'Parses natural language text to extract due date, priority, and project from the input string.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['text'],
                properties: {
                  text: { type: 'string', example: 'Buy milk tomorrow p1' },
                  projectId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Task created from natural language' } },
      },
    },
    '/api/v1/tasks/bulk': {
      post: {
        tags: ['Tasks'],
        summary: 'Bulk operation on multiple tasks',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['taskIds', 'action'],
                properties: {
                  taskIds: { type: 'array', items: { type: 'string' } },
                  action: {
                    type: 'string',
                    enum: ['complete', 'uncomplete', 'delete', 'move', 'updatePriority'],
                  },
                  data: {
                    type: 'object',
                    properties: {
                      projectId: { type: 'string' },
                      sectionId: { type: 'string', nullable: true },
                      priority: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Bulk operation result' } },
      },
    },
    '/api/v1/tasks/reorder': {
      put: {
        tags: ['Tasks'],
        summary: 'Reorder tasks',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['taskIds'],
                properties: {
                  taskIds: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Tasks reordered' } },
      },
    },
    '/api/v1/projects': {
      get: {
        tags: ['Projects'],
        summary: 'List user projects',
        responses: {
          200: {
            description: 'Project list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { type: 'array', items: { $ref: '#/components/schemas/Project' } },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Projects'],
        summary: 'Create a project',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                  color: { type: 'string', description: 'Hex color, e.g. #3B82F6' },
                  workspaceId: { type: 'string' },
                  parentId: { type: 'string' },
                  viewStyle: { type: 'string', enum: ['LIST', 'BOARD', 'CALENDAR'] },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Project created' } },
      },
    },
    '/api/v1/projects/{id}': {
      get: {
        tags: ['Projects'],
        summary: 'Get project by ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Project details' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Projects'],
        summary: 'Update a project',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Updated project' } },
      },
      delete: {
        tags: ['Projects'],
        summary: 'Delete a project',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/api/v1/labels': {
      get: { tags: ['Labels'], summary: 'List labels', responses: { 200: { description: 'Label list' } } },
      post: {
        tags: ['Labels'],
        summary: 'Create a label',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                  color: { type: 'string', example: '#ef4444' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Label created' } },
      },
    },
    '/api/v1/labels/{id}': {
      patch: {
        tags: ['Labels'],
        summary: 'Update a label',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Updated' } },
      },
      delete: {
        tags: ['Labels'],
        summary: 'Delete a label',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/api/v1/search': {
      get: {
        tags: ['Search'],
        summary: 'Full-text search',
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string' }, description: 'Search query' },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['task', 'project', 'comment'] }, description: 'Comma-separable entity types' },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: {
            description: 'Search results grouped by type',
            content: {
              'application/json': {
                example: {
                  success: true,
                  data: { tasks: [], projects: [], comments: [] },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'List notifications',
        parameters: [
          { name: 'unreadOnly', in: 'query', schema: { type: 'boolean' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
          { name: 'cursor', in: 'query', schema: { type: 'string' }, description: 'Cursor from the previous page' },
        ],
        responses: { 200: { description: 'Notification list' } },
      },
    },
    '/api/v1/notifications/mark-all-read': {
      post: {
        tags: ['Notifications'],
        summary: 'Mark all notifications as read',
        responses: { 200: { description: 'All marked read' } },
      },
    },
    '/api/v1/settings/preferences': {
      patch: { tags: ['Settings'], summary: 'Update user preferences', responses: { 200: { description: 'Updated preferences' } } },
    },
    '/api/v1/settings/export': {
      get: { tags: ['Settings'], summary: 'Export all user data as JSON', responses: { 200: { description: 'Data export' } } },
    },
    '/api/v1/settings/data': {
      delete: { tags: ['Settings'], summary: 'Delete account and personal data', responses: { 200: { description: 'Account deleted' }, 409: { description: 'Owns shared workspaces — transfer first' } } },
    },
    '/api/v1/templates': {
      get: { tags: ['Templates'], summary: 'List templates', responses: { 200: { description: 'Template list' } } },
      post: { tags: ['Templates'], summary: 'Create a template', responses: { 201: { description: 'Template created' } } },
    },
    '/api/v1/templates/{id}/apply': {
      post: {
        tags: ['Templates'],
        summary: 'Apply a template to create tasks in a project',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', description: 'Name for the project created from the template' },
                  workspaceId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Tasks created from template' } },
      },
    },
    '/api/v1/workspaces': {
      get: { tags: ['Workspaces'], summary: 'List workspaces', responses: { 200: { description: 'Workspace list' } } },
      post: { tags: ['Workspaces'], summary: 'Create a workspace', responses: { 201: { description: 'Workspace created' } } },
    },
    '/api/v1/workspaces/{id}/members': {
      get: {
        tags: ['Workspaces'],
        summary: 'List workspace members',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Member list' } },
      },
    },
    '/api/v1/workspaces/{id}/invite': {
      post: {
        tags: ['Workspaces'],
        summary: 'Invite a member by email',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  role: { type: 'string', enum: ['ADMIN', 'MEMBER', 'GUEST'] },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Invitation sent' } },
      },
    },
    '/api/v1/admin/stats': {
      get: {
        tags: ['Admin'],
        summary: 'Instance account counts',
        responses: {
          200: { description: 'Total, active, suspended, admin and unverified counts' },
          403: { description: 'Administrator access required' },
        },
      },
    },
    '/api/v1/admin/users': {
      get: {
        tags: ['Admin'],
        summary: 'List every account on the instance',
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string', maxLength: 200 } },
          { name: 'role', in: 'query', schema: { type: 'string', enum: ['USER', 'ADMIN'] } },
          { name: 'isActive', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
        ],
        responses: {
          200: { description: 'Paginated user list' },
          403: { description: 'Administrator access required' },
        },
      },
      post: {
        tags: ['Admin'],
        summary: 'Create an account on a user’s behalf',
        description:
          'Admin-created accounts are email-verified up front. Omit `password` to have ' +
          'the server generate one; it is returned once as `temporaryPassword` and is ' +
          'never stored in plaintext or retrievable afterwards.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'name'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  name: { type: 'string', minLength: 1, maxLength: 100 },
                  password: { type: 'string', minLength: 8, maxLength: 72 },
                  role: { type: 'string', enum: ['USER', 'ADMIN'] },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Account created, with a one-time temporaryPassword when generated' },
          403: { description: 'Administrator access required' },
          409: { description: 'A user with this email already exists' },
        },
      },
    },
    '/api/v1/admin/users/{id}': {
      get: {
        tags: ['Admin'],
        summary: 'Account detail, with workspace memberships and content counts',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'User detail' },
          404: { description: 'User not found' },
        },
      },
      delete: {
        tags: ['Admin'],
        summary: 'Permanently delete an account',
        description:
          'Refused for your own account (use DELETE /users/me), for the last active ' +
          'administrator, and while the user still owns a workspace that other people ' +
          'are members of — deleting them would take the team’s data with them.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Account deleted' },
          400: { description: 'Cannot delete your own account from the admin console' },
          409: { description: 'Last administrator, or still owns a shared workspace' },
        },
      },
    },
    '/api/v1/admin/users/{id}/role': {
      patch: {
        tags: ['Admin'],
        summary: 'Promote or demote an account',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['role'],
                properties: { role: { type: 'string', enum: ['USER', 'ADMIN'] } },
              },
            },
          },
        },
        responses: {
          200: { description: 'Updated user' },
          409: { description: 'Cannot demote the last active administrator' },
        },
      },
    },
    '/api/v1/admin/users/{id}/status': {
      patch: {
        tags: ['Admin'],
        summary: 'Suspend or reactivate an account',
        description:
          'Suspending keeps all data but blocks sign-in, deletes every refresh token ' +
          'and drops live sockets. An access token already issued stays valid until it ' +
          'expires (15 minutes at most).',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['isActive'],
                properties: { isActive: { type: 'boolean' } },
              },
            },
          },
        },
        responses: {
          200: { description: 'Updated user' },
          400: { description: 'You cannot deactivate your own account' },
          409: { description: 'Cannot deactivate the last active administrator' },
        },
      },
    },
    '/api/v1/admin/users/{id}/password': {
      post: {
        tags: ['Admin'],
        summary: 'Set another user’s password',
        description:
          'Omit `password` to have the server generate one, returned once as ' +
          '`temporaryPassword`. Always revokes that user’s sessions.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  password: { type: 'string', minLength: 8, maxLength: 72 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Password reset; temporaryPassword present when generated' },
          404: { description: 'User not found' },
        },
      },
    },
  },
} as const;
