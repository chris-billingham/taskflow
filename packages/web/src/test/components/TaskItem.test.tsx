import '../mocks/socket';
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { API } from '../msw/handlers';
import { makeTask, ok } from '../msw/fixtures';
import { renderPage } from '../helpers/renderPage';

// Mock sub-components that have complex dependencies
vi.mock('@/components/task/DueDatePicker', () => ({
  DueDateBadge: ({ dueDate }: { dueDate: string | null }) =>
    dueDate ? <span data-testid="due-date-badge">{dueDate}</span> : null,
  DueDatePicker: () => null,
}));

vi.mock('@/components/task/PriorityPicker', () => ({
  PriorityPicker: () => null,
}));

vi.mock('@/components/task/LabelPicker', () => ({
  LabelBadges: () => null,
  LabelPicker: () => null,
}));

import { TaskItem } from '@/components/task/TaskItem';
import type { Task } from '@/types/task';

function renderItem(task: Task) {
  return renderPage(<TaskItem task={task} showSubtasks />);
}

describe('TaskItem', () => {
  it('renders the task content', () => {
    renderItem(makeTask({ content: 'Buy groceries' }));
    expect(screen.getByText('Buy groceries')).toBeInTheDocument();
  });

  it('dims a completed task', () => {
    const { container } = renderItem(makeTask({ isCompleted: true }));
    expect(container.querySelector('.opacity-60')).not.toBeNull();
  });

  it('completes the task through the API when its box is ticked', async () => {
    const completed = vi.fn();
    server.use(
      http.post(`${API}/tasks/:id/complete`, ({ params }) => {
        completed(params.id);
        return HttpResponse.json(ok(makeTask({ id: String(params.id), isCompleted: true })));
      }),
    );
    renderItem(makeTask({ id: 'task-1' }));

    fireEvent.click(screen.getByRole('checkbox', { name: /complete task/i }));
    await waitFor(() => expect(completed).toHaveBeenCalledWith('task-1'));
  });

  it('reopens a completed task', async () => {
    const reopened = vi.fn();
    server.use(
      http.post(`${API}/tasks/:id/uncomplete`, ({ params }) => {
        reopened(params.id);
        return HttpResponse.json(ok(makeTask({ id: String(params.id) })));
      }),
    );
    renderItem(makeTask({ id: 'task-1', isCompleted: true }));

    fireEvent.click(screen.getByRole('checkbox', { name: /mark task incomplete/i }));
    await waitFor(() => expect(reopened).toHaveBeenCalledWith('task-1'));
  });

  it('opens the task in the panel by putting it in the URL', async () => {
    server.use(http.get(`${API}/tasks/task-1`, () => HttpResponse.json(ok(makeTask({ id: 'task-1' })))));
    const { user } = renderItem(makeTask({ id: 'task-1', content: 'Buy groceries' }));

    await user.click(screen.getByRole('button', { name: 'Open task: Buy groceries' }));
    expect(screen.getByTestId('current-url')).toHaveTextContent('/?task=task-1');
    expect(await screen.findByRole('dialog', { name: 'Task detail' })).toBeInTheDocument();
  });

  it('marks p1 tasks with the red border', () => {
    const { container } = renderItem(makeTask({ priority: 1 }));
    expect(container.querySelector('.border-l-red-500')).not.toBeNull();
  });

  it('shows the due date badge only when there is a due date', () => {
    const { unmount } = renderItem(makeTask({ dueDate: '2024-01-15' }));
    expect(screen.getByTestId('due-date-badge')).toBeInTheDocument();
    unmount();
    renderItem(makeTask());
    expect(screen.queryByTestId('due-date-badge')).not.toBeInTheDocument();
  });

  it('fetches a project row’s subtasks only when it is expanded', async () => {
    const fetched = vi.fn();
    server.use(
      http.get(`${API}/tasks`, ({ request }) => {
        fetched(new URL(request.url).searchParams.get('parentId'));
        return HttpResponse.json(
          ok([makeTask({ id: 'sub-1', content: 'Pick a colour', parentId: 'task-1' })], { nextCursor: null }),
        );
      }),
    );
    const parent = makeTask({ id: 'task-1', _count: { subtasks: 1, comments: 0 } });
    delete parent.subtasks;
    const { user } = renderItem(parent);

    expect(fetched).not.toHaveBeenCalled();
    await user.click(screen.getAllByRole('button')[0]);
    expect(await screen.findByText('Pick a colour')).toBeInTheDocument();
    expect(fetched).toHaveBeenCalledWith('task-1');
  });
});
