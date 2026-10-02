/**
 * Every BullMQ queue, by the name its jobs live under in Redis. The worker
 * modules create the queues; the admin console and /metrics read them.
 */
export const QUEUE_NAMES = {
  reminders: 'reminder-check',
  digests: 'notification-digest',
  dueTasks: 'due-task-check',
  delivery: 'notification-delivery',
  maintenance: 'maintenance',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const ALL_QUEUES: QueueName[] = Object.values(QUEUE_NAMES);
