import {
  createReminderQueue,
  startReminderWorker,
  scheduleReminderChecks,
} from './jobs/reminderJob.js';
import {
  createDigestQueue,
  startDigestWorker,
  scheduleDigestJobs,
} from './jobs/notificationDigest.js';

export async function initializeWorkers() {
  console.log('[Worker] Initializing BullMQ workers...');

  // Reminder check worker - runs every minute
  const reminderQueue = createReminderQueue();
  const reminderWorker = startReminderWorker();
  await scheduleReminderChecks(reminderQueue);
  console.log('[Worker] Reminder check worker started');

  // Notification digest worker - daily/weekly
  const digestQueue = createDigestQueue();
  const digestWorker = startDigestWorker();
  await scheduleDigestJobs(digestQueue);
  console.log('[Worker] Notification digest worker started');

  // Graceful shutdown handler
  const shutdown = async () => {
    console.log('[Worker] Shutting down workers...');
    await Promise.all([
      reminderWorker.close(),
      digestWorker.close(),
      reminderQueue.close(),
      digestQueue.close(),
    ]);
  };

  return { shutdown, reminderQueue, digestQueue };
}
