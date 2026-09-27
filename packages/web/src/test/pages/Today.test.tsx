import '../mocks/socket';
import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { API } from '../msw/handlers';
import { apiDate, localDateString, makeTask, ok } from '../msw/fixtures';
import { renderPage } from '../helpers/renderPage';
import type { Task } from '@/types/task';
import Today from '@/pages/app/Today';

type Buckets = Partial<Record<'overdue' | 'morning' | 'afternoon' | 'evening' | 'noTime', Task[]>>;

function todayView(buckets: Buckets = {}) {
  const b = { overdue: [], morning: [], afternoon: [], evening: [], noTime: [], ...buckets };
  const today = b.morning.length + b.afternoon.length + b.evening.length + b.noTime.length;
  return {
    ...b,
    counts: {
      overdue: b.overdue.length,
      morning: b.morning.length,
      afternoon: b.afternoon.length,
      evening: b.evening.length,
      noTime: b.noTime.length,
      total: today + b.overdue.length,
      returned: today + b.overdue.length,
    },
  };
}

/** Serve successive responses to GET /views/today, repeating the last one. */
function serveTodayViews(...views: ReturnType<typeof todayView>[]) {
  let call = 0;
  server.use(
    http.get(`${API}/views/today`, () =>
      HttpResponse.json(ok(views[Math.min(call++, views.length - 1)])),
    ),
    // The task panel loads a task's full detail when it opens.
    http.get(`${API}/tasks/:id`, ({ params }) => {
      const view = views[views.length - 1];
      const task = [...view.overdue, ...view.morning, ...view.afternoon, ...view.evening, ...view.noTime].find(
        (t) => t.id === params.id,
      );
      return task
        ? HttpResponse.json(ok(task))
        : HttpResponse.json({ success: false, error: 'NOT_FOUND', message: 'Task not found' }, { status: 404 });
    }),
  );
}

const today = apiDate(localDateString());
const yesterday = apiDate(localDateString(-1));

describe('Today page', () => {
  it("shows overdue tasks and today's tasks", async () => {
    serveTodayViews(
      todayView({
        overdue: [makeTask({ content: 'Renew passport', dueDate: yesterday })],
        noTime: [makeTask({ content: 'Write the launch post', dueDate: today })],
      }),
    );

    renderPage(<Today />, { route: '/today', path: '/today' });

    expect(await screen.findByText('Renew passport')).toBeInTheDocument();
    expect(screen.getByText('Write the launch post')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
  });

  it('shows the empty state when nothing is due', async () => {
    serveTodayViews(todayView());

    renderPage(<Today />, { route: '/today', path: '/today' });

    expect(await screen.findByText('All clear for today')).toBeInTheDocument();
  });

  it('completing a task removes it at once and saves it', async () => {
    const task = makeTask({ content: 'Write the launch post', dueDate: today });
    serveTodayViews(todayView({ noTime: [task] }), todayView());
    let completedId: string | undefined;
    server.use(
      http.post(`${API}/tasks/:id/complete`, ({ params }) => {
        completedId = params.id as string;
        return HttpResponse.json(ok({ ...task, isCompleted: true }));
      }),
    );

    const { user } = renderPage(<Today />, { route: '/today', path: '/today' });
    await screen.findByText('Write the launch post');
    await user.click(screen.getByRole('checkbox', { name: 'Complete task' }));

    await waitFor(() => expect(screen.queryByText('Write the launch post')).not.toBeInTheDocument());
    expect(completedId).toBe(task.id);
  });

  it('adds a task from Quick Add', async () => {
    serveTodayViews(todayView());
    let submitted: unknown;
    server.use(
      http.post(`${API}/tasks/quick-add`, async ({ request }) => {
        submitted = await request.json();
        return HttpResponse.json(ok(makeTask({ content: 'Call the printer', dueDate: today })), {
          status: 201,
        });
      }),
    );

    const { user } = renderPage(<Today />, { route: '/today', path: '/today' });
    await screen.findByText('All clear for today');
    const addButton = screen.queryByRole('button', { name: 'Add task' });
    if (addButton) await user.click(addButton);
    await user.type(screen.getByPlaceholderText(/^Add task \(use/), 'Call the printer today{Enter}');

    await waitFor(() => expect(submitted).toMatchObject({ text: 'Call the printer today', defaultDueDate: localDateString() }));
  });

  it('opens the task panel when a task is clicked', async () => {
    serveTodayViews(todayView({ noTime: [makeTask({ content: 'Write the launch post', dueDate: today })] }));

    const { user } = renderPage(<Today />, { route: '/today', path: '/today' });
    await user.click(await screen.findByRole('button', { name: 'Open task: Write the launch post' }));

    const panel = await screen.findByRole('dialog', { name: 'Task detail' });
    expect(within(panel).getByRole('heading', { name: 'Write the launch post' })).toBeInTheDocument();
  });
});
