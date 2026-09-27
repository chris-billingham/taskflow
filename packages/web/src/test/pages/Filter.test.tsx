import '../mocks/socket';
import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { API } from '../msw/handlers';
import { makeTask, ok } from '../msw/fixtures';
import { renderPage } from '../helpers/renderPage';
import type { Task } from '@/types/task';
import Filter from '@/pages/app/Filter';

const savedFilter = {
  id: 'f-urgent',
  name: 'Urgent',
  query: 'p1',
  color: '#DB4C3F',
  isFavorite: false,
  sortOrder: 0,
  viewStyle: 'LIST',
  userId: 'user-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** Serve the saved filter and its result pages. Each page is [tasks, nextCursor]. */
function serveFilter(pages: Array<[Task[], string | null]>) {
  const bodies: Array<{ query: string; cursor?: string }> = [];
  server.use(
    http.get(`${API}/filters`, () => HttpResponse.json(ok([savedFilter]))),
    http.post(`${API}/filters/query`, async ({ request }) => {
      const body = (await request.json()) as { query: string; cursor?: string };
      bodies.push(body);
      const index = body.cursor ? pages.findIndex((_, i) => pages[i - 1]?.[1] === body.cursor) : 0;
      const [tasks, nextCursor] = pages[Math.max(index, 0)];
      return HttpResponse.json(ok(tasks, { nextCursor }));
    }),
    http.post(`${API}/tasks/:id/complete`, ({ params }) =>
      HttpResponse.json(ok(makeTask({ id: String(params.id), isCompleted: true }))),
    ),
  );
  return bodies;
}

function openFilter() {
  return renderPage(<Filter />, { route: `/filters/${savedFilter.id}`, path: '/filters/:id' });
}

describe('Filter page', () => {
  it('loads further pages of results with the cursor from the last one', async () => {
    const bodies = serveFilter([
      [[makeTask({ id: 't1', content: 'First page task' })], 'cursor-2'],
      [[makeTask({ id: 't2', content: 'Second page task' })], null],
    ]);

    const { user } = openFilter();
    await screen.findByText('First page task');
    await user.click(screen.getByRole('button', { name: 'Load more tasks' }));

    expect(await screen.findByText('Second page task')).toBeInTheDocument();
    expect(screen.getByText('First page task')).toBeInTheDocument();
    expect(bodies.at(-1)).toEqual({ query: 'p1', cursor: 'cursor-2' });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Load more tasks' })).not.toBeInTheDocument(),
    );
  });

  it('keeps every loaded page after an edit refreshes the results', async () => {
    const bodies = serveFilter([
      [[makeTask({ id: 't1', content: 'First page task' })], 'cursor-2'],
      [[makeTask({ id: 't2', content: 'Second page task' })], null],
    ]);

    const { user } = openFilter();
    await screen.findByText('First page task');
    await user.click(screen.getByRole('button', { name: 'Load more tasks' }));
    await screen.findByText('Second page task');

    const requestsBefore = bodies.length;
    await user.click(screen.getAllByRole('checkbox', { name: 'Complete task' })[0]);

    // The refresh re-reads both pages rather than collapsing to the first.
    await waitFor(() => expect(bodies.length).toBe(requestsBefore + 2));
    expect(await screen.findByText('Second page task')).toBeInTheDocument();
  });
});
