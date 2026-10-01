import '../mocks/socket';
import { describe, it, expect } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
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

describe('reordering', () => {
  it('sends only the dragged task, placed after its new neighbour, at the midpoint', async () => {
    const calls: { url: string; body: unknown }[] = [];
    server.use(
      http.post(`${API}/tasks/:id/position`, async ({ request, params }) => {
        calls.push({ url: String(params.id), body: await request.json() });
        return HttpResponse.json(ok(makeTask({ id: String(params.id) })));
      }),
    );
    const qc = createTestQueryClient();
    const key = taskKeys.list({ projectId: 'project-1' });
    qc.setQueryData<InfiniteData<TaskPage>>(key, {
      pages: [
        {
          tasks: [makeTask({ id: 'a', sortOrder: 1 }), makeTask({ id: 'b', sortOrder: 2 }), makeTask({ id: 'c', sortOrder: 3 })],
          nextCursor: null,
        },
      ],
      pageParams: [undefined],
    });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useTaskActions(), { wrapper });

    let pending: Promise<unknown>;
    act(() => {
      pending = result.current.reorderTasks(['a', 'c', 'b'], 'c');
    });
    const sortOf = (id: string) => qc.getQueryData<InfiniteData<TaskPage>>(key)!.pages[0].tasks.find((t) => t.id === id)!.sortOrder;
    await waitFor(() => expect(sortOf('c')).toBe(1.5));
    expect(sortOf('b')).toBe(2);
    await act(() => pending);
    expect(calls).toEqual([{ url: 'c', body: { afterId: 'a' } }]);
  });
});
