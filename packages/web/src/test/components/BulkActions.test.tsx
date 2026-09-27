import '../mocks/socket';
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { API } from '../msw/handlers';
import { makeTask } from '../msw/fixtures';
import { renderPage } from '../helpers/renderPage';
import { TaskItem } from '@/components/task/TaskItem';
import { BulkActionBar } from '@/components/task/BulkActionBar';
import { useSelectionStore } from '@/stores/selectionStore';

let bulkCalls: Array<{ taskIds: string[]; action: string; data?: unknown }> = [];

beforeEach(() => {
  useSelectionStore.getState().clear();
  bulkCalls = [];
  server.use(
    http.post(`${API}/tasks/bulk`, async ({ request }) => {
      const body = (await request.json()) as (typeof bulkCalls)[number];
      bulkCalls.push(body);
      return HttpResponse.json({ success: true, message: 'ok', count: body.taskIds.length });
    }),
  );
});

function renderList() {
  return renderPage(
    <>
      <TaskItem task={makeTask({ id: 'a', content: 'Alpha' })} />
      <TaskItem task={makeTask({ id: 'b', content: 'Bravo' })} />
      <TaskItem task={makeTask({ id: 'c', content: 'Charlie' })} />
      <BulkActionBar />
    </>,
  );
}

describe('selecting several tasks', () => {
  it('Ctrl-click selects; then plain clicks toggle; the bar acts on the selection', async () => {
    const { user } = renderList();
    await user.keyboard('{Control>}');
    await user.click(screen.getByRole('button', { name: 'Open task: Alpha' }));
    await user.keyboard('{/Control}');

    const bar = screen.getByRole('toolbar', { name: 'Actions for 1 task' });
    expect(within(bar).getByText('1 selected')).toBeInTheDocument();
    // While selecting, a plain click selects instead of opening.
    await user.click(screen.getByRole('button', { name: 'Select task: Bravo' }));
    expect(screen.getByRole('button', { name: 'Select task: Bravo' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('current-url')).toHaveTextContent(/^\/$/);

    await user.click(within(screen.getByRole('toolbar')).getByRole('button', { name: 'Set priority' }));
    await user.click(screen.getByRole('menuitem', { name: 'Priority 1' }));
    await waitFor(() =>
      expect(bulkCalls).toEqual([{ taskIds: ['a', 'b'], action: 'updatePriority', data: { priority: 1 } }]),
    );
    // Acting clears the selection.
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('bulk delete offers Undo, which restores them', async () => {
    const { user } = renderList();
    await user.click(screen.getByRole('button', { name: 'Options for Alpha' }));
    await user.click(screen.getByRole('menuitem', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: 'Select task: Charlie' }));

    await user.click(within(screen.getByRole('toolbar')).getByRole('button', { name: 'Delete' }));
    const toast = (await screen.findByText('2 tasks moved to trash')).parentElement!;
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(bulkCalls.map((c) => [c.action, c.taskIds])).toEqual([
      ['delete', ['a', 'c']],
      ['restore', ['a', 'c']],
    ]));
  });

  it('Escape and the clear button empty the selection', async () => {
    const { user } = renderList();
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('button', { name: 'Open task: Alpha' }));
    await user.keyboard('{/Shift}');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();

    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('button', { name: 'Open task: Alpha' }));
    await user.keyboard('{/Shift}');
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.getByRole('button', { name: 'Open task: Alpha' })).toBeInTheDocument();
  });
});
