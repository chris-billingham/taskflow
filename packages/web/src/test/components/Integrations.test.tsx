import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mockApi } from '../mocks/api';
import { CalendarFeedDialog } from '@/components/integrations/CalendarFeedDialog';
import { WebhooksDialog } from '@/components/integrations/WebhooksDialog';

const FEED = {
  id: 'f1',
  url: 'https://tasks.example.com/api/v1/calendar/secret123.ics',
  name: 'Launch',
  projectId: 'p1',
  filterId: null,
  createdAt: '2026-10-02T09:00:00.000Z',
  lastFetchedAt: null,
};
const WEBHOOK = {
  id: 'w1',
  projectId: 'p1',
  url: 'https://n8n.example.com/hook',
  events: ['task.completed'],
  isActive: true,
  lastDeliveryAt: '2026-10-02T09:00:00.000Z',
  lastStatus: 500,
  lastError: 'The receiver answered 500',
  failureCount: 1,
  createdAt: '2026-10-01T09:00:00.000Z',
};

const wrap = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

beforeEach(() => {
  mockApi.get.mockReset();
  mockApi.post.mockReset();
});

describe('CalendarFeedDialog', () => {
  it('shows the project’s feed link, with a webcal link for calendar apps', async () => {
    mockApi.post.mockResolvedValue({ data: { success: true, data: FEED } });
    wrap(<CalendarFeedDialog target={{ projectId: 'p1' }} name="Launch" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText('Calendar feed link')).toHaveValue(FEED.url));
    expect(mockApi.post).toHaveBeenCalledWith('/calendar-feeds', { projectId: 'p1' });
    expect(screen.getByRole('link', { name: 'Open in calendar app' })).toHaveAttribute(
      'href',
      'webcal://tasks.example.com/api/v1/calendar/secret123.ics',
    );
  });
});

describe('WebhooksDialog', () => {
  it('lists webhooks with their last failure, and shows a new one’s secret once', async () => {
    mockApi.get.mockResolvedValue({ data: { success: true, data: [WEBHOOK] } });
    mockApi.post.mockResolvedValue({ data: { success: true, data: { ...WEBHOOK, id: 'w2', secret: 'whsec_abc' } } });
    const user = userEvent.setup();
    wrap(<WebhooksDialog projectId="p1" name="Launch" onClose={() => {}} />);

    expect(await screen.findByText(/Last delivery failed .* The receiver answered 500/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Address'), 'https://example.com/hook');
    await user.click(screen.getByLabelText('Comment added'));
    await user.click(screen.getByRole('button', { name: 'Add webhook' }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/projects/p1/webhooks', {
        url: 'https://example.com/hook',
        events: ['task.created', 'task.completed', 'comment.created'],
      }),
    );
    expect(await screen.findByText('whsec_abc')).toBeInTheDocument();
  });

  it('tells people who aren’t admins that only admins can manage them', async () => {
    mockApi.get.mockRejectedValue({ response: { status: 403, data: { message: 'Forbidden' } } });
    wrap(<WebhooksDialog projectId="p1" name="Launch" onClose={() => {}} />);
    expect(await screen.findByText(/Only this project’s admins/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add webhook' })).not.toBeInTheDocument();
  });
});
