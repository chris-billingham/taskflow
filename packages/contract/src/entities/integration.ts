import { z } from 'zod';
import { id, instant, type Wire } from '../common.js';

/** A private calendar (iCal) subscription to a project's or a filter's dated tasks. */
export const calendarFeedSchema = z.object({
  id,
  /** Subscribe to this in a calendar app. Anyone with it can read the feed. */
  url: z.string(),
  /** The project or filter's name. */
  name: z.string(),
  projectId: z.string().nullable(),
  filterId: z.string().nullable(),
  createdAt: instant,
  lastFetchedAt: instant.nullable(),
});
export type CalendarFeed = Wire<typeof calendarFeedSchema>;

/** What a webhook can be sent for. */
export const WEBHOOK_EVENTS = [
  'task.created',
  'task.updated',
  'task.completed',
  'task.uncompleted',
  'task.deleted',
  'comment.created',
  'comment.deleted',
] as const;
export const webhookEventSchema = z.enum(WEBHOOK_EVENTS);
export type WebhookEvent = Wire<typeof webhookEventSchema>;

export const webhookSchema = z.object({
  id,
  projectId: id,
  url: z.string(),
  events: z.array(webhookEventSchema),
  isActive: z.boolean(),
  lastDeliveryAt: instant.nullable(),
  /** The receiver's last HTTP status, or null if it couldn't be reached. */
  lastStatus: z.number().int().nullable(),
  lastError: z.string().nullable(),
  /** Failed deliveries in a row; the webhook pauses itself at 50. */
  failureCount: z.number().int(),
  createdAt: instant,
});
export type Webhook = Wire<typeof webhookSchema>;

/** Creating a webhook or replacing its secret: the secret, to check signatures with. */
export const webhookWithSecretSchema = webhookSchema.extend({ secret: z.string() });
export type WebhookWithSecret = Wire<typeof webhookWithSecretSchema>;

/** POST /settings/import: what was created. */
export const importSummarySchema = z.object({
  projects: z.number().int(),
  sections: z.number().int(),
  tasks: z.number().int(),
  comments: z.number().int(),
  attachments: z.number().int(),
  labels: z.number().int(),
  filters: z.number().int(),
  /** Things that couldn't be imported as they were, e.g. an unreadable date. */
  warnings: z.array(z.string()),
});
export type ImportSummary = Wire<typeof importSummarySchema>;
