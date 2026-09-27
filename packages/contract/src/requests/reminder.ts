import { z } from 'zod';

const reminderFields = z.object({
  type: z.enum(['ABSOLUTE', 'RELATIVE']),
  triggerAt: z.iso.datetime().optional(),
  minutesBefore: z.number().int().min(1).max(40320).optional(), // max 4 weeks
  method: z.enum(['PUSH', 'EMAIL']).optional(),
});

const timingRule = [
  (data: z.infer<typeof reminderFields>) => {
    if (data.type === 'ABSOLUTE' && !data.triggerAt) return false;
    if (data.type === 'RELATIVE' && !data.minutesBefore) return false;
    return true;
  },
  {
    message: 'ABSOLUTE reminders require triggerAt, RELATIVE reminders require minutesBefore',
  },
] as const;

/** POST /tasks/:taskId/reminders: the task comes from the URL. */
export const createReminderBodySchema = reminderFields.refine(...timingRule);

export const createReminderSchema = reminderFields
  .extend({ taskId: z.string().min(1, 'Task ID is required') })
  .refine(...timingRule);

export const reminderParamsSchema = z.object({
  id: z.string().min(1, 'Reminder ID is required'),
});


export type CreateReminderInput = z.infer<typeof createReminderSchema>;
export type ReminderParams = z.infer<typeof reminderParamsSchema>;
