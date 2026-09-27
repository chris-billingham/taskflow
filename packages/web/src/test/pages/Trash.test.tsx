import '../mocks/socket';
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { API } from '../msw/handlers';
import { makeTask, ok } from '../msw/fixtures';
import { renderPage } from '../helpers/renderPage';
import { TaskItem } from '@/components/task/TaskItem';
import Trash from '@/pages/app/Trash';

const trashed = (id: string, content: string) => ({
  ...makeTask({ id, content }),
  project: { id: 'project-1', name: 'Home', color: '#3b82f6' },
  deletedAt: new Date(Date.now() - 3_600_000).toISOString(),
  purgeAt: new Date(Date.now() + 29 * 86_400_000).toISOString(),
});

describe('Trash page', () => {
  it('lists trashed tasks and restores one', async () => {
    let trash = [trashed('t1', 'Old errand'), trashed('t2', 'Stale idea')];
    const restored = vi.fn();
    server.use(
      http.get(`${API}/tasks/trash`, () => HttpResponse.json(ok(trash))),
      http.post(`${API}/tasks/:id/restore`, ({ params }) => {
        restored(params.id);
        trash = trash.filter((t) => t.id !== params.id);
        return HttpResponse.json(ok(makeTask({ id: String(params.id) })));
      }),
    );
    const { user } = renderPage(<Trash />);

    expect(await screen.findByText('Old errand', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getAllByText(/Gone for good on/)).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Restore Old errand' }));

    await waitFor(() => expect(restored).toHaveBeenCalledWith('t1'));
    await waitFor(() => expect(screen.queryByText('Old errand', { selector: 'p' })).not.toBeInTheDocument());
  });

  it('asks before deleting forever', async () => {
    const purged = vi.fn();
    server.use(
      http.get(`${API}/tasks/trash`, () => HttpResponse.json(ok([trashed('t1', 'Old errand')]))),
      http.delete(`${API}/tasks/:id/permanent`, ({ params }) => {
        purged(params.id);
        return HttpResponse.json({ success: true, message: 'Task deleted permanently' });
      }),
    );
    const { user } = renderPage(<Trash />);

    await user.click(await screen.findByRole('button', { name: 'Delete Old errand forever' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete forever?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete forever' }));
    await waitFor(() => expect(purged).toHaveBeenCalledWith('t1'));
  });

  it('says when it is empty', async () => {
    server.use(http.get(`${API}/tasks/trash`, () => HttpResponse.json(ok([]))));
    renderPage(<Trash />);
    expect(await screen.findByText('The trash is empty.')).toBeInTheDocument();
  });
});

describe('Undo', () => {
  it('restores a task deleted from its menu', async () => {
    const restored = vi.fn();
    server.use(
      http.delete(`${API}/tasks/t1`, () => HttpResponse.json({ success: true, message: 'Task moved to trash' })),
      http.post(`${API}/tasks/t1/restore`, () => {
        restored();
        return HttpResponse.json(ok(makeTask({ id: 't1' })));
      }),
    );
    const { user } = renderPage(<TaskItem task={makeTask({ id: 't1', content: 'Call the bank' })} />);

    await user.click(screen.getByRole('button', { name: 'Options for Call the bank' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    // The toast (the page's other status region is the test's URL probe).
    const toast = (await screen.findByText('Task moved to trash')).parentElement!;
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(restored).toHaveBeenCalled());
  });

  it('reopens a completed task, taking back the next occurrence of a repeating one', async () => {
    const calls: string[] = [];
    server.use(
      http.post(`${API}/tasks/t1/complete`, () => {
        calls.push('complete');
        // A repeating task answers with its next occurrence.
        return HttpResponse.json(ok(makeTask({ id: 't1-next', isRecurring: true })));
      }),
      http.delete(`${API}/tasks/t1-next`, () => {
        calls.push('delete next');
        return HttpResponse.json({ success: true, message: 'Task moved to trash' });
      }),
      http.post(`${API}/tasks/t1/uncomplete`, () => {
        calls.push('uncomplete');
        return HttpResponse.json(ok(makeTask({ id: 't1' })));
      }),
    );
    const { user } = renderPage(
      <TaskItem task={makeTask({ id: 't1', content: 'Water plants', isRecurring: true, recurrenceRule: 'FREQ=DAILY' })} />,
    );

    await user.click(screen.getByRole('checkbox', { name: /complete task/i }));
    const toast = (await screen.findByText('Task completed')).parentElement!;
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(calls).toEqual(['complete', 'delete next', 'uncomplete']));
  });
});
