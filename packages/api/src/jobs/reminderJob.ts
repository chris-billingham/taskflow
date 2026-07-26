import { Worker, Queue } from 'bullmq';
import { createBullMQConnection } from '../config/redis.js';
import {
  getDueReminders,
  claimReminder,
  releaseReminderAfterFailure,
} from '../services/reminderService.js';
import {
  createNotification,
  sendPushNotification,
  sendEmailNotification,
} from '../services/notificationService.js';

const QUEUE_NAME = 'reminder-check';

export function createReminderQueue() {
  return new Queue(QUEUE_NAME, {
    connection: createBullMQConnection(),
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  });
}

export function startReminderWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      const dueReminders = await getDueReminders();

      for (const reminder of dueReminders) {
        // Claim BEFORE sending. The old order (send, then mark) meant any
        // failure after the notification went out re-delivered the same
        // reminder every 60 seconds forever. Claim-first bounds duplicates
        // to at most one per crash, and failures release the claim with a
        // capped attempt counter.
        if (!(await claimReminder(reminder.id))) continue;

        try {
          const taskContent = reminder.task.content;
          const title = 'Task Reminder';
          const body = `Reminder: ${taskContent}`;
          const data = {
            taskId: reminder.task.id,
            projectId: reminder.task.projectId,
            reminderId: reminder.id,
          };

          // Create in-app notification
          await createNotification(
            reminder.userId,
            'REMINDER',
            title,
            body,
            data,
          );

          // Send via the reminder's configured method
          if (reminder.method === 'PUSH') {
            await sendPushNotification(reminder.userId, title, body, data);
          } else if (reminder.method === 'EMAIL') {
            await sendEmailNotification(reminder.userId, 'REMINDER', {
              taskContent,
              ...data,
            });
          }
        } catch (err) {
          console.error(`Failed to process reminder ${reminder.id}:`, err);
          await releaseReminderAfterFailure(reminder.id).catch(() => {
            /* claim stays; better under- than over-notify */
          });
        }
      }
    },
    {
      connection: createBullMQConnection(),
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`Reminder job ${job?.id} failed:`, err.message);
  });

  return worker;
}

export async function scheduleReminderChecks(queue: Queue) {
  // Add a repeatable job that runs every minute
  await queue.add(
    'check-reminders',
    {},
    {
      repeat: { every: 60_000 }, // every 60 seconds
    },
  );
}
