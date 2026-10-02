import { z } from 'zod';
import { webhookEventSchema } from '../entities/integration.js';

/** POST /calendar-feeds: one of the two; returns the existing feed if there is one. */
export const createCalendarFeedSchema = z
  .object({ projectId: z.string().min(1).optional(), filterId: z.string().min(1).optional() })
  .refine((v) => !!v.projectId !== !!v.filterId, { message: 'Choose a project or a filter' });

const webhookUrl = z
  .url({ protocol: /^https?$/, message: 'Enter a web address starting with https:// or http://' })
  .max(2000);

export const createWebhookSchema = z.object({
  url: webhookUrl,
  events: z.array(webhookEventSchema).min(1, 'Choose at least one event'),
});

export const updateWebhookSchema = z.object({
  url: webhookUrl.optional(),
  events: z.array(webhookEventSchema).min(1, 'Choose at least one event').optional(),
  /** Turning a paused webhook back on clears its failure count. */
  isActive: z.boolean().optional(),
});

export const integrationParamsSchema = z.object({ id: z.string().min(1) });
export const webhookDeliveryParamsSchema = z.object({ id: z.string().min(1), deliveryId: z.string().min(1) });
export const calendarFileParamsSchema = z.object({ file: z.string().min(1).max(200) });
