import '../mocks/socket';
import { describe, it, expect, vi } from 'vitest';
import { useMemo, useState } from 'react';
import { act, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { API } from '../msw/handlers';
import { makeProject, makeTask, ok } from '../msw/fixtures';
import { renderPage } from '../helpers/renderPage';
import { TaskItem } from '@/components/task/TaskItem';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { ShortcutsSheet } from '@/components/layout/ShortcutsSheet';
import { useSelectionStore } from '@/stores/selectionStore';

function Harness() {
  const [palette, setPalette] = useState(false);
  const [sheet, setSheet] = useState(false);
  const handlers = useMemo(
    () => ({ quickAdd: vi.fn(), search: vi.fn(), commandPalette: () => setPalette(true), shortcutsSheet: () => setSheet(true) }),
    [],
  );
  useKeyboardShortcuts(handlers);
  return (
    <>
      <TaskItem task={makeTask({ id: 'a', content: 'Alpha' })} />
      <TaskItem task={makeTask({ id: 'b', content: 'Bravo' })} />
      <TaskItem task={makeTask({ id: 'c', content: 'Charlie' })} />
      <CommandPalette isOpen={palette} onClose={() => setPalette(false)} onQuickAdd={vi.fn()} onSearch={vi.fn()} onShortcuts={vi.fn()} />
      <ShortcutsSheet isOpen={sheet} onClose={() => setSheet(false)} />
    </>
  );
}

const row = (name: string) => screen.getByRole('button', { name: `Open task: ${name}` });

describe('keyboard control', () => {
  it('j/k move between tasks; c, 1–4 and d act on the focused one', async () => {
    const calls: string[] = [];
    server.use(
      http.post(`${API}/tasks/:id/complete`, ({ params }) => {
        calls.push(`complete ${params.id}`);
        return HttpResponse.json(ok(makeTask({ id: String(params.id), isCompleted: true })));
      }),
      http.patch(`${API}/tasks/:id`, async ({ params, request }) => {
        calls.push(`patch ${params.id} ${JSON.stringify(await request.json())}`);
        return HttpResponse.json(ok(makeTask({ id: String(params.id) })));
      }),
      http.delete(`${API}/tasks/:id`, ({ params }) => {
        calls.push(`delete ${params.id}`);
        return HttpResponse.json({ success: true, message: 'Task moved to trash' });
      }),
    );
    const { user } = renderPage(<Harness />);

    await user.keyboard('j');
    expect(row('Alpha')).toHaveFocus();
    await user.keyboard('jj');
    expect(row('Charlie')).toHaveFocus();
    await user.keyboard('k');
    expect(row('Bravo')).toHaveFocus();

    await user.keyboard('c');
    await user.keyboard('2');
    await user.keyboard('d');
    await waitFor(() =>
      expect(calls).toEqual(['complete b', 'patch b {"priority":2}', 'delete b']),
    );
    // Focus stays in the list, on the next task.
    expect(row('Charlie')).toHaveFocus();
  });

  it('x selects, e renames in place, t opens the date picker', async () => {
    const { user } = renderPage(<Harness />);
    await user.keyboard('j');
    await user.keyboard('x');
    expect(useSelectionStore.getState().ids).toEqual(['a']);
    act(() => useSelectionStore.getState().clear());

    row('Alpha').focus();
    await user.keyboard('t');
    expect(await screen.findByRole('dialog', { name: 'Due date' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Due date' })).not.toBeInTheDocument();

    row('Alpha').focus();
    await user.keyboard('e');
    expect(screen.getByDisplayValue('Alpha')).toHaveFocus();
  });

  it('? shows the shortcuts; ⌘K opens the palette, which navigates', async () => {
    server.use(http.get(`${API}/projects`, () => HttpResponse.json(ok([makeProject({ id: 'p1', name: 'Garden' })]))));
    const { user } = renderPage(<Harness />);

    await user.keyboard('?');
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.keyboard('{Meta>}k{/Meta}');
    await user.type(screen.getByLabelText('Type a command or a place'), 'gard');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByTestId('current-url')).toHaveTextContent('/projects/p1'));
  });
});
