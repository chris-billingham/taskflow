import '../mocks/socket';
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { API } from '../msw/handlers';
import { makeTask, ok, TEST_USER } from '../msw/fixtures';
import { renderPage } from '../helpers/renderPage';
import Assigned from '@/pages/app/Assigned';
import { ProjectActivity } from '@/components/activity/ProjectActivity';

describe('Assigned to me', () => {
  it('asks for your open assigned tasks and lists them', async () => {
    const asked = vi.fn();
    server.use(
      http.post(`${API}/filters/query`, async ({ request }) => {
        asked(((await request.json()) as { query: string }).query);
        return HttpResponse.json({ ...ok([makeTask({ content: 'Write the brief', assigneeId: TEST_USER.id })]), nextCursor: null });
      }),
    );
    renderPage(<Assigned />);
    expect(await screen.findByText('Write the brief')).toBeInTheDocument();
    expect(asked).toHaveBeenCalledWith('assigned to: me & !completed');
  });

  it('says so when nothing is assigned', async () => {
    server.use(http.post(`${API}/filters/query`, () => HttpResponse.json({ ...ok([]), nextCursor: null })));
    renderPage(<Assigned />);
    expect(await screen.findByText('Nothing is assigned to you right now.')).toBeInTheDocument();
  });
});

describe('Project activity', () => {
  it('names each task and opens it', async () => {
    server.use(
      // The task it opens exists (a missing one closes the panel again).
      http.get(`${API}/tasks/t1`, () => HttpResponse.json(ok(makeTask({ id: 't1', content: 'Order flowers' })))),
      http.get(`${API}/projects/:id/activity`, () =>
        HttpResponse.json({
          ...ok([
            {
              id: 'a1',
              userId: 'u2',
              action: 'COMPLETED',
              entityType: 'TASK',
              entityId: 't1',
              oldData: null,
              newData: null,
              taskId: 't1',
              createdAt: new Date().toISOString(),
              user: { id: 'u2', name: 'Grace', avatarUrl: null },
              task: { id: 't1', content: 'Order flowers' },
            },
          ]),
          nextCursor: null,
        }),
      ),
    );
    const onClose = vi.fn();
    const { user } = renderPage(<ProjectActivity project={{ id: 'p1', name: 'Party' }} onClose={onClose} />);
    const panel = await screen.findByRole('dialog', { name: 'Project activity' });
    const link = await within(panel).findByRole('button', { name: 'Order flowers' });
    expect(within(panel).getByText('Grace')).toBeInTheDocument();
    await user.click(link);
    await waitFor(() => expect(screen.getByTestId('current-url')).toHaveTextContent('task=t1'));
    expect(onClose).toHaveBeenCalled();
  });
});
