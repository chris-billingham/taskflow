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
import {
  createMaintenanceQueue,
  startMaintenanceWorker,
  scheduleMaintenanceJobs,
} from './jobs/maintenanceJob.js';
import {
  createDueTaskQueue,
  startDueTaskWorker,
  scheduleDueTaskChecks,
} from './jobs/dueTaskJob.js';

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

  // Due-soon / overdue notices - hourly, gated on each user's local time
  const dueTaskQueue = createDueTaskQueue();
  const dueTaskWorker = startDueTaskWorker();
  await scheduleDueTaskChecks(dueTaskQueue);
  console.log('[Worker] Due-task check worker started');

  // Daily cleanup - expired refresh tokens and invites
  const maintenanceQueue = createMaintenanceQueue();
  const maintenanceWorker = startMaintenanceWorker();
  await scheduleMaintenanceJobs(maintenanceQueue);
  console.log('[Worker] Maintenance worker started');

  // Graceful shutdown handler
  const shutdown = async () => {
    console.log('[Worker] Shutting down workers...');
    await Promise.all([
      reminderWorker.close(),
      digestWorker.close(),
      dueTaskWorker.close(),
      maintenanceWorker.close(),
      reminderQueue.close(),
      digestQueue.close(),
      dueTaskQueue.close(),
      maintenanceQueue.close(),
    ]);
  };

  return { shutdown, reminderQueue, digestQueue, dueTaskQueue };
}
