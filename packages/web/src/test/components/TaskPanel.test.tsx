import '../mocks/socket';
import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router';
import { server } from '../msw/server';
import { API } from '../msw/handlers';
import { makeTask, ok } from '../msw/fixtures';
import { renderPage } from '../helpers/renderPage';
import TaskLink from '@/pages/app/TaskLink';
import type { Task } from '@/types/task';

function serveTasks(...tasks: Task[]) {
  server.use(
    http.get(`${API}/tasks/:id`, ({ params }) => {
      const task = tasks.find((t) => t.id === params.id);
      return task
        ? HttpResponse.json(ok(task))
        : HttpResponse.json({ success: false, error: 'NOT_FOUND', message: 'Task not found' }, { status: 404 });
    }),
  );
}

const panel = () => screen.findByRole('dialog', { name: 'Task detail' });
const url = () => screen.getByTestId('current-url').textContent;

describe('task panel', () => {
  it('opens the task named in the URL on any page, and closes by dropping it', async () => {
    serveTasks(makeTask({ id: 't1', content: 'Book the venue' }));
    const { user } = renderPage(<p>Some page</p>, { route: '/upcoming?task=t1', path: '/upcoming' });

    expect(within(await panel()).getByRole('heading', { name: 'Book the venue' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close task detail' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Task detail' })).not.toBeInTheDocument());
    expect(url()).toBe('/upcoming');
  });

  it('opens a subtask from its parent, and goes back up to the parent', async () => {
    const child = makeTask({ id: 'c1', content: 'Order flowers', parentId: 'p1', parent: { id: 'p1', content: 'Plan the party' } as Task['parent'] });
    const parent = makeTask({ id: 'p1', content: 'Plan the party', subtasks: [child] as Task['subtasks'] });
    serveTasks(parent, child);
    const { user } = renderPage(<p>Page</p>, { route: '/today?task=p1', path: '/today' });

    await user.click(within(await panel()).getByRole('button', { name: 'Open subtask: Order flowers' }));
    expect(await screen.findByRole('heading', { name: 'Order flowers' })).toBeInTheDocument();
    expect(url()).toBe('/today?task=c1');

    await user.click(screen.getByRole('button', { name: 'Open parent task: Plan the party' }));
    expect(await screen.findByRole('heading', { name: 'Plan the party' })).toBeInTheDocument();
  });

  it('says so and closes when the task is gone', async () => {
    serveTasks();
    renderPage(<p>Page</p>, { route: '/today?task=deleted', path: '/today' });

    expect(await screen.findByText('That task no longer exists or you no longer have access')).toBeInTheDocument();
    await waitFor(() => expect(url()).toBe('/today'));
  });

  it('an edit in the panel shows in the list behind it at once', async () => {
    // A server that remembers the edit, as the refetch after it will ask.
    let task = makeTask({ id: 't1', content: 'Draft agenda', projectId: 'project-1' });
    server.use(
      http.get(`${API}/tasks/t1`, () => HttpResponse.json(ok(task))),
      http.get(`${API}/tasks`, () => HttpResponse.json(ok([task], { nextCursor: null }))),
      http.patch(`${API}/tasks/t1`, async ({ request }) => {
        task = { ...task, ...((await request.json()) as Partial<Task>) };
        return HttpResponse.json(ok(task));
      }),
    );
    const { TaskList } = await import('@/components/task/TaskList');
    const { useProjectTasks } = await import('@/queries/tasks');
    function List() {
      const { tasks } = useProjectTasks('project-1');
      return <TaskList tasks={tasks} />;
    }
    const { user } = renderPage(<List />, { route: '/projects/project-1?task=t1', path: '/projects/project-1' });

    const dialog = await panel();
    await user.click(within(dialog).getByRole('heading', { name: 'Draft agenda' }));
    const input = within(dialog).getByDisplayValue('Draft agenda');
    await user.clear(input);
    await user.type(input, 'Final agenda{Enter}');

    expect(await screen.findByRole('button', { name: 'Open task: Final agenda' })).toBeInTheDocument();
  });
});

describe('comments in the panel', () => {
  it('posts a comment and shows it, refreshing the activity log', async () => {
    let comments: Array<Record<string, unknown>> = [];
    let activityReads = 0;
    serveTasks(makeTask({ id: 't1', content: 'Plan the offsite' }));
    server.use(
      http.get(`${API}/tasks/t1/comments`, () => HttpResponse.json(ok(comments, { nextCursor: null }))),
      http.get(`${API}/tasks/t1/activity`, () => {
        activityReads++;
        return HttpResponse.json(ok([], { nextCursor: null }));
      }),
      http.post(`${API}/tasks/t1/comments`, async ({ request }) => {
        const { content } = (await request.json()) as { content: string };
        const comment = {
          id: 'c1', content, taskId: 't1', projectId: null, parentId: null, authorId: 'user-1',
          author: { id: 'user-1', name: 'Test User', avatarUrl: null },
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), replies: [],
          attachments: [],
        };
        comments = [comment];
        return HttpResponse.json(ok(comment), { status: 201 });
      }),
    );
    const { user } = renderPage(<p>Page</p>, { route: '/today?task=t1', path: '/today' });

    const dialog = await panel();
    await user.type(within(dialog).getByPlaceholderText('Write a comment...'), 'Venue booked');
    const readsBefore = activityReads;
    await user.click(within(dialog).getByRole('button', { name: /comment/i }));

    expect(await within(dialog).findByText('Venue booked')).toBeInTheDocument();
    await waitFor(() => expect(activityReads).toBeGreaterThan(readsBefore));
  });
});

describe('/tasks/:id', () => {
  it('opens the task over its project', async () => {
    serveTasks(makeTask({ id: 't9', projectId: 'project-7' }));
    renderPage(
      <Routes>
        <Route path="/tasks/:id" element={<TaskLink />} />
        <Route path="/projects/:id" element={<p>Project page</p>} />
      </Routes>,
      { route: '/tasks/t9', path: '/*' },
    );
    await waitFor(() => expect(url()).toBe('/projects/project-7?task=t9'));
  });
});
