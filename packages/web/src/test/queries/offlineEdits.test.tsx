import '../mocks/socket';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { API } from '../msw/handlers';
import { makeTask, ok } from '../msw/fixtures';
import { createTestQueryClient } from '../helpers/renderPage';
import { useTaskActions } from '@/queries/taskActions';
import { taskKeys } from '@/queries/taskKeys';
import type { TaskPage } from '@/queries/taskCache';
import { clearOutbox, flushOutbox, loadOutbox, useOutbox } from '@/queries/outbox';
import { useToastStore } from '@/stores/toastStore';

// Changes made offline: shown at once, queued, sent in order on reconnect,
// and refused (not forced) when someone else changed the task meanwhile.
const key = taskKeys.list({ projectId: 'project-1' });
let online = true;

function setup() {
  const qc = createTestQueryClient();
  qc.setQueryData<InfiniteData<TaskPage>>(key, {
    pages: [{ tasks: [makeTask({ id: 'a', content: 'Buy milk', version: 3 }), makeTask({ id: 'b', content: 'Call Sam' })], nextCursor: null }],
    pageParams: [undefined],
  });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useTaskActions(), { wrapper });
  const task = (id: string) => qc.getQueryData<InfiniteData<TaskPage>>(key)!.pages[0].tasks.find((t) => t.id === id);
  return { qc, actions: () => result.current, task };
}

beforeEach(async () => {
  online = true;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  await loadOutbox('user-1');
  await clearOutbox();
  useToastStore.setState({ toasts: [] });
});
afterEach(() => vi.restoreAllMocks());

describe('offline edits', () => {
  it('shows changes at once and queues them, without calling the server', async () => {
    const calls: string[] = [];
    server.use(http.all(`${API}/*`, ({ request }) => void calls.push(request.url)));
    const { actions, task } = setup();
    online = false;

    await act(() => actions().completeTask('a'));
    await act(() => actions().updateTask('b', { content: 'Call Sam back' }));
    await act(() => actions().quickAddTask('Water plants tomorrow'));

    expect(task('a')?.isCompleted).toBe(true);
    expect(task('b')?.content).toBe('Call Sam back');
    expect(calls).toEqual([]);
    expect(useOutbox.getState().entries.map((e) => [e.method, e.url, e.label])).toEqual([
      ['post', '/tasks/a/complete', 'Completing “Buy milk”'],
      ['patch', '/tasks/b', 'Your change to “Call Sam”'],
      ['post', '/tasks/quick-add', 'Adding “Water plants tomorrow”'],
    ]);
    // An edit sent later says which version it was made against.
    expect(useOutbox.getState().entries[1].body).toEqual({ content: 'Call Sam back', ifVersion: 1 });
    // No undo for a change the server hasn't seen.
    expect(useToastStore.getState().toasts.some((t) => t.action)).toBe(false);
  });

  it('sends the queue in order on reconnect, dropping a change made stale elsewhere', async () => {
    const sent: string[] = [];
    server.use(
      http.post(`${API}/tasks/:id/complete`, ({ params }) => {
        sent.push(`complete ${params.id}`);
        return HttpResponse.json(ok(makeTask({ id: String(params.id), isCompleted: true })));
      }),
      http.patch(`${API}/tasks/:id`, ({ params }) => {
        sent.push(`patch ${params.id}`);
        return HttpResponse.json({ success: false, error: 'VERSION_CONFLICT', message: 'Changed elsewhere', current: {} }, { status: 409 });
      }),
      http.delete(`${API}/tasks/:id`, ({ params }) => {
        sent.push(`delete ${params.id}`);
        return HttpResponse.json({ success: true, message: 'ok' });
      }),
    );
    const { qc, actions } = setup();
    online = false;
    await act(() => actions().completeTask('a'));
    await act(() => actions().updateTask('a', { content: 'Buy oat milk' }));
    await act(() => actions().deleteTask('b'));
    expect(useOutbox.getState().entries).toHaveLength(3);

    online = true;
    await act(() => flushOutbox(qc));
    expect(sent).toEqual(['complete a', 'patch a', 'delete b']);
    expect(useOutbox.getState().entries).toEqual([]);
    expect(useToastStore.getState().toasts.map((t) => t.message)).toContain(
      "Your change to “Buy milk” wasn't saved: someone changed it while you were offline.",
    );
  });

  it('keeps the queue when the connection drops again mid-way', async () => {
    let first = true;
    server.use(
      http.post(`${API}/tasks/:id/complete`, () => {
        if (first) {
          first = false;
          return HttpResponse.json(ok(makeTask({ id: 'a', isCompleted: true })));
        }
        return HttpResponse.error();
      }),
    );
    const { qc, actions } = setup();
    online = false;
    await act(() => actions().completeTask('a'));
    await act(() => actions().completeTask('b'));
    online = true;
    await act(() => flushOutbox(qc));
    expect(useOutbox.getState().entries.map((e) => e.url)).toEqual(['/tasks/b/complete']);
  });

  it('queues a change whose request fails for want of a connection, though the browser thought it was online', async () => {
    server.use(http.post(`${API}/tasks/:id/uncomplete`, () => HttpResponse.error()));
    const { actions, task } = setup();
    await act(() => actions().uncompleteTask('a'));
    expect(task('a')?.isCompleted).toBe(false);
    expect(useOutbox.getState().entries.map((e) => e.url)).toEqual(['/tasks/a/uncomplete']);
  });

  it('several offline changes to one task each expect the version the one before left', async () => {
    const { actions } = setup();
    online = false;
    await act(() => actions().updateTask('a', { content: 'Buy oat milk' }));
    await act(() => actions().completeTask('a'));
    await act(() => actions().updateTask('a', { priority: 1 }));
    const bodies = useOutbox.getState().entries.map((e) => e.body as { ifVersion?: number } | undefined);
    // Version 3 in the cache; each change bumps it on the server, as here.
    expect(bodies[0]?.ifVersion).toBe(3);
    expect(bodies[2]?.ifVersion).toBe(5);
  });

  it('each queued edit follows on from the version the previous one reached on the server', async () => {
    const sentVersions: unknown[] = [];
    let serverVersion = 3;
    server.use(
      http.patch(`${API}/tasks/:id`, async ({ request }) => {
        const body = (await request.json()) as { ifVersion?: number };
        sentVersions.push(body.ifVersion);
        if (body.ifVersion !== serverVersion) {
          return HttpResponse.json({ success: false, error: 'VERSION_CONFLICT', message: 'x', current: {} }, { status: 409 });
        }
        serverVersion += 2; // a label change touches the task twice
        return HttpResponse.json(ok(makeTask({ id: 'a', version: serverVersion })));
      }),
    );
    const { qc, actions } = setup();
    online = false;
    await act(() => actions().updateTask('a', { content: 'One' }));
    await act(() => actions().updateTask('a', { content: 'Two' }));
    online = true;
    await act(() => flushOutbox(qc));
    expect(sentVersions).toEqual([3, 5]);
    expect(useToastStore.getState().toasts).toEqual([]);
  });
});
