import '../mocks/socket';
import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router';
import { server } from '../msw/server';
import { API } from '../msw/handlers';
import { makeTask, ok } from '../msw/fixtures';
import { renderPage } from '../helpers/renderPage';
import { boardColumns } from '@/components/views/GroupedBoard';
import { useUIStore } from '@/stores/uiStore';
import Label from '@/pages/app/Label';
import type { Task } from '@/types/task';

const actions = () => ({ updateTask: vi.fn(), moveTask: vi.fn() });
const titles = (cols: ReturnType<typeof boardColumns>) => cols.map((c) => c.title);
const contents = (cols: ReturnType<typeof boardColumns>, title: string) =>
  cols.find((c) => c.title === title)!.tasks.map((t) => t.content);

describe('boardColumns', () => {
  it('groups by priority, and a drop sets the priority', () => {
    const a = actions();
    const tasks = [makeTask({ content: 'Low', priority: 4 }), makeTask({ content: 'Urgent', priority: 1 })];
    const cols = boardColumns(tasks, 'priority', a);
    expect(titles(cols)).toEqual(['Priority 1', 'Priority 2', 'Priority 3', 'Priority 4']);
    expect(contents(cols, 'Priority 1')).toEqual(['Urgent']);
    cols[1].drop!(tasks[0]);
    expect(a.updateTask).toHaveBeenCalledWith(tasks[0].id, { priority: 2 });
  });

  it('groups by due date; only single-day columns take a drop', () => {
    const a = actions();
    const now = new Date(2026, 8, 27, 10);
    const due = (content: string, dueDate: string | null) => makeTask({ content, dueDate, dueTime: dueDate ? '09:00' : null });
    const tasks = [
      due('Late', '2026-09-20'),
      due('Now', '2026-09-27T00:00:00.000Z'),
      due('Soon', '2026-09-28'),
      due('This week', '2026-10-02'),
      due('Later on', '2026-11-01'),
      due('Someday', null),
    ];
    const cols = boardColumns(tasks, 'dueDate', a, now);
    expect(titles(cols)).toEqual(['Overdue', 'Today', 'Tomorrow', 'Next 7 days', 'Later', 'No date']);
    expect(cols.map((c) => c.tasks.map((t) => t.content))).toEqual([['Late'], ['Now'], ['Soon'], ['This week'], ['Later on'], ['Someday']]);
    expect(cols.filter((c) => c.drop).map((c) => c.title)).toEqual(['Today', 'Tomorrow', 'No date']);

    cols.find((c) => c.title === 'Tomorrow')!.drop!(tasks[0]);
    expect(a.updateTask).toHaveBeenCalledWith(tasks[0].id, { dueDate: '2026-09-28' });
    cols.find((c) => c.title === 'No date')!.drop!(tasks[1]);
    expect(a.updateTask).toHaveBeenCalledWith(tasks[1].id, { dueDate: null, dueTime: null });
    // No overdue tasks, no Overdue column.
    expect(titles(boardColumns(tasks.slice(1), 'dueDate', a, now))[0]).toBe('Today');
  });

  it('groups by assignee, unassigned first', () => {
    const a = actions();
    const person = (id: string, name: string) => ({ id, name, email: `${id}@x.test`, avatarUrl: null }) as Task['assignee'];
    const tasks = [
      makeTask({ content: 'Zed task', assignee: person('u2', 'Zed') }),
      makeTask({ content: 'Amy task', assignee: person('u1', 'Amy') }),
      makeTask({ content: 'Nobody' }),
    ];
    const cols = boardColumns(tasks, 'assignee', a);
    expect(titles(cols)).toEqual(['Unassigned', 'Amy', 'Zed']);
    cols[1].drop!(tasks[2]);
    expect(a.updateTask).toHaveBeenCalledWith(tasks[2].id, { assigneeId: 'u1' });
    cols[0].drop!(tasks[0]);
    expect(a.updateTask).toHaveBeenCalledWith(tasks[0].id, { assigneeId: null });
  });

  it('groups by project, and a drop moves the task there', () => {
    const a = actions();
    const tasks = [
      makeTask({ content: 'Paint', projectId: 'p2', project: { id: 'p2', name: 'Home', color: '#000' } as Task['project'] }),
      makeTask({ content: 'Deploy', projectId: 'p1', project: { id: 'p1', name: 'Work', color: '#000' } as Task['project'] }),
    ];
    const cols = boardColumns(tasks, 'project', a);
    expect(titles(cols)).toEqual(['Home', 'Work']);
    cols[1].drop!(tasks[0]);
    expect(a.moveTask).toHaveBeenCalledWith(tasks[0].id, { projectId: 'p1', sectionId: null });
  });
});

describe('label board', () => {
  it('switches to a board, regroups, and remembers the grouping', async () => {
    server.use(
      http.get(`${API}/labels`, () =>
        HttpResponse.json(ok([{ id: 'l1', name: 'errand', color: '#f00', isFavorite: false, sortOrder: 0, workspaceId: null, ownerId: 'u', createdAt: '', updatedAt: '' }])),
      ),
      http.post(`${API}/filters/query`, () =>
        HttpResponse.json({
          ...ok([
            makeTask({ content: 'Buy milk', priority: 1, projectId: 'p1', project: { id: 'p1', name: 'Home', color: '#000' } as Task['project'] }),
            makeTask({ content: 'Post parcel', priority: 3, projectId: 'p2', project: { id: 'p2', name: 'Work', color: '#000' } as Task['project'] }),
          ]),
          nextCursor: null,
        }),
      ),
    );
    const { user } = renderPage(
      <Routes>
        <Route path="/labels/:id" element={<Label />} />
      </Routes>,
      { route: '/labels/l1', path: '/*' },
    );

    await user.click(await screen.findByRole('button', { name: 'Board view' }));
    const p1 = await screen.findByRole('region', { name: 'Priority 1 column' });
    expect(within(p1).getByText('Buy milk')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Group by: Priority' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Project' }));
    expect(within(screen.getByRole('region', { name: 'Work column' })).getByText('Post parcel')).toBeInTheDocument();
    expect(useUIStore.getState().boardGrouping['label:l1']).toBe('project');
  });
});
