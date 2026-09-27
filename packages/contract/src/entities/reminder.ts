import { z } from 'zod';
import { id, instant, type Wire } from '../common.js';

export const reminderSchema = z.object({
  id,
  taskId: id,
  userId: id,
  type: z.enum(['ABSOLUTE', 'RELATIVE']),
  /** When it fires: set for ABSOLUTE, computed from the due time for RELATIVE. */
  triggerAt: instant.nullable(),
  minutesBefore: z.number().int().nullable(),
  method: z.enum(['PUSH', 'EMAIL']),
  isSent: z.boolean(),
  sentAt: instant.nullable(),
  attempts: z.number().int(),
  createdAt: instant,
});
export type Reminder = Wire<typeof reminderSchema>;
