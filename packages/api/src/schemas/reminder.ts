import { z } from 'zod';

export const createReminderSchema = z.object({
  taskId: z.string().min(1, 'Task ID is required'),
  type: z.enum(['ABSOLUTE', 'RELATIVE']),
  triggerAt: z.string().datetime().optional(),
  minutesBefore: z.number().int().min(1).max(40320).optional(), // max 4 weeks
  method: z.enum(['PUSH', 'EMAIL']).optional(),
}).refine(
  (data) => {
    if (data.type === 'ABSOLUTE' && !data.triggerAt) return false;
    if (data.type === 'RELATIVE' && !data.minutesBefore) return false;
    return true;
  },
  {
    message: 'ABSOLUTE reminders require triggerAt, RELATIVE reminders require minutesBefore',
  },
);

export const reminderParamsSchema = z.object({
  id: z.string().min(1, 'Reminder ID is required'),
});

export const taskParamsSchema = z.object({
  taskId: z.string().min(1, 'Task ID is required'),
});

export type CreateReminderInput = z.infer<typeof createReminderSchema>;
export type ReminderParams = z.infer<typeof reminderParamsSchema>;
export type TaskParams = z.infer<typeof taskParamsSchema>;
