import { z } from 'zod';
import { id, instant, json, type Wire } from '../common.js';

export const activitySchema = z.object({
  id,
  userId: id,
  action: z.enum([
    'CREATED',
    'UPDATED',
    'DELETED',
    'COMPLETED',
    'UNCOMPLETED',
    'MOVED',
    'ASSIGNED',
    'UNASSIGNED',
    'COMMENTED',
    'ARCHIVED',
    'UNARCHIVED',
    'SHARED',
  ]),
  entityType: z.enum(['TASK', 'PROJECT', 'SECTION', 'COMMENT', 'LABEL', 'WORKSPACE']),
  entityId: id,
  /** Snapshots of what changed; shape depends on the action. */
  oldData: json.nullable(),
  newData: json.nullable(),
  taskId: id.nullable(),
  createdAt: instant,
  user: z.object({ id, name: z.string(), avatarUrl: z.string().nullable() }),
});
export type Activity = Wire<typeof activitySchema>;
