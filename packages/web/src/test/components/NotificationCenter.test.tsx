import '../mocks/socket';
import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { API } from '../msw/handlers';
import { ok } from '../msw/fixtures';
import { renderPage } from '../helpers/renderPage';
import { NotificationCenter } from '@/components/notification/NotificationCenter';

const notification = (id: string, title: string, isRead = false) => ({
  id,
  userId: 'user-1',
  type: 'COMMENT_MENTION',
  title,
  body: 'In "Launch plan"',
  data: { taskId: 't1', projectId: 'p1' },
  isRead,
  readAt: null,
  createdAt: new Date().toISOString(),
});

describe('NotificationCenter', () => {
  it('shows the unread count, and marking all read clears it at once', async () => {
    let allRead = false;
    server.use(
      http.get(`${API}/notifications`, () =>
        HttpResponse.json(
          ok([notification('n1', 'Ada mentioned you', allRead), notification('n2', 'Due soon', true)], {
            nextCursor: null,
            unreadCount: allRead ? 0 : 1,
          }),
        ),
      ),
      http.post(`${API}/notifications/mark-all-read`, () => {
        allRead = true;
        return HttpResponse.json({ success: true, count: 1 });
      }),
    );
    const { user } = renderPage(
      <>
        <NotificationCenter />
        <NotificationCenter />
      </>,
    );

    // Two instances (mobile and desktop headers) share one cached list.
    await waitFor(() => expect(screen.getAllByText('1')).toHaveLength(2));
    await user.click(screen.getAllByRole('button', { name: /notifications/i })[0]);
    const dropdown = screen.getByRole('heading', { name: 'Notifications' }).closest('div')!.parentElement!;
    expect(within(dropdown).getByText('Ada mentioned you')).toBeInTheDocument();

    await user.click(within(dropdown).getByRole('button', { name: 'Mark all read' }));
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    await waitFor(() => expect(allRead).toBe(true));
    expect(screen.getAllByRole('button', { name: 'Notifications' })).toHaveLength(2);
  });

  it('opens the join page for a workspace invite', async () => {
    server.use(
      http.get(`${API}/notifications`, () =>
        HttpResponse.json(
          ok(
            [
              {
                ...notification('n1', 'Workspace invitation'),
                type: 'WORKSPACE_INVITE',
                data: { workspaceId: 'w1', inviteToken: 'tok-1' },
              },
            ],
            { nextCursor: null, unreadCount: 1 },
          ),
        ),
      ),
      http.post(`${API}/notifications/mark-read`, () => HttpResponse.json({ success: true })),
    );
    const { user } = renderPage(<NotificationCenter />);

    await user.click(await screen.findByRole('button', { name: /notifications/i }));
    await user.click(await screen.findByText('Workspace invitation'));
    await waitFor(() => expect(screen.getByTestId('current-url').textContent).toBe('/join'));
  });
});
