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
import { startNotificationDeliveryWorker } from './jobs/notificationDelivery.js';
import { logger } from './config/logger.js';
import { startHeartbeat } from './services/workerHeartbeat.js';

export async function initializeWorkers() {
  logger.info('Initializing BullMQ workers...');

  // Reminder check worker - runs every minute
  const reminderQueue = createReminderQueue();
  const reminderWorker = startReminderWorker();
  await scheduleReminderChecks(reminderQueue);
  logger.info('Reminder check worker started');

  // Notification digest worker - daily/weekly
  const digestQueue = createDigestQueue();
  const digestWorker = startDigestWorker();
  await scheduleDigestJobs(digestQueue);
  logger.info('Notification digest worker started');

  // Due-soon / overdue notices - hourly, gated on each user's local time
  const dueTaskQueue = createDueTaskQueue();
  const dueTaskWorker = startDueTaskWorker();
  await scheduleDueTaskChecks(dueTaskQueue);
  logger.info('Due-task check worker started');

  // Email and push for notifications created by the API
  const deliveryWorker = startNotificationDeliveryWorker();
  logger.info('Notification delivery worker started');

  // Daily cleanup - expired refresh tokens and invites
  const maintenanceQueue = createMaintenanceQueue();
  const maintenanceWorker = startMaintenanceWorker();
  await scheduleMaintenanceJobs(maintenanceQueue);
  logger.info('Maintenance worker started');

  // Tells the admin console, /metrics and the container healthcheck that jobs run.
  const stopHeartbeat = startHeartbeat();

  // Graceful shutdown handler
  const shutdown = async () => {
    logger.info('Shutting down workers...');
    stopHeartbeat();
    await Promise.all([
      reminderWorker.close(),
      digestWorker.close(),
      dueTaskWorker.close(),
      maintenanceWorker.close(),
      deliveryWorker.close(),
      reminderQueue.close(),
      digestQueue.close(),
      dueTaskQueue.close(),
      maintenanceQueue.close(),
    ]);
  };

  return { shutdown, reminderQueue, digestQueue, dueTaskQueue };
}
