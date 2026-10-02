import { describe, it, expect, vi, beforeEach } from 'vitest';

const senders = vi.hoisted(() => ({
  sendWebPush: vi.fn(),
  sendApplePush: vi.fn(),
  sendEmailNotification: vi.fn(),
}));
vi.mock('../../services/notificationService.js', () => senders);
vi.mock('../../config/database.js', () => ({
  prisma: {
    notification: {
      findUnique: vi.fn().mockResolvedValue({ userId: 'u1', type: 'TASK_ASSIGNED', title: 'Assigned', body: 'You have a task', data: {} }),
    },
  },
}));

import { deliverNotification } from '../../jobs/notificationDelivery.js';

beforeEach(() => {
  for (const send of Object.values(senders)) send.mockReset().mockResolvedValue(undefined);
});

describe('deliverNotification', () => {
  it('sends by every channel, asking each to report failures', async () => {
    expect(await deliverNotification('n1')).toEqual({ delivered: ['webpush', 'apns', 'email'], failed: [] });
    expect(senders.sendWebPush).toHaveBeenCalledWith('u1', 'Assigned', 'You have a task', {}, true);
    expect(senders.sendEmailNotification).toHaveBeenCalledWith('u1', 'TASK_ASSIGNED', expect.any(Object), false, true);
  });

  it('reports a failed channel (a mail server down) so the queue retries it', async () => {
    senders.sendEmailNotification.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await deliverNotification('n1')).toEqual({ delivered: ['webpush', 'apns'], failed: ['email'] });
  });

  it('on a retry, sends only what didn’t go the first time', async () => {
    await deliverNotification('n1', ['webpush', 'apns']);
    expect(senders.sendWebPush).not.toHaveBeenCalled();
    expect(senders.sendApplePush).not.toHaveBeenCalled();
    expect(senders.sendEmailNotification).toHaveBeenCalledTimes(1);
  });
});
