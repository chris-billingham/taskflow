import '../mocks/socket';
import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { API } from '../msw/handlers';
import { TEST_USER, makeProject, makeSection, makeTask, ok } from '../msw/fixtures';
import { renderPage } from '../helpers/renderPage';
import type { Project as ProjectType } from '@/types/project';
import type { Task } from '@/types/task';
import Project from '@/pages/app/Project';

// Viewers and commenters see a project without the controls they can't use;
// a task assigned to them stays theirs to work.
function serve(project: ProjectType, tasks: Task[]) {
  server.use(
    http.get(`${API}/projects`, () => HttpResponse.json(ok([project]))),
    http.get(`${API}/projects/${project.id}`, () => HttpResponse.json(ok(project))),
    http.get(`${API}/tasks`, () => HttpResponse.json(ok(tasks, { nextCursor: null }))),
    http.get(`${API}/tasks/:id`, ({ params }) => HttpResponse.json(ok(tasks.find((t) => t.id === params.id)))),
    http.get(`${API}/tasks/:id/comments`, () => HttpResponse.json(ok([]))),
  );
}

function open(project: ProjectType, query = '') {
  return renderPage(<Project />, { route: `/projects/${project.id}${query}`, path: '/projects/:id' });
}

describe('project access in the web app', () => {
  it('leaves out adding and editing for a viewer, but not on their own task', async () => {
    const project = makeProject({ id: 'p-view', name: 'Board minutes', access: 'VIEW' });
    project.sections = [makeSection({ id: 's1', name: 'Agenda', projectId: project.id })];
    serve(project, [
      makeTask({ id: 't-other', content: 'Approve budget', projectId: project.id }),
      makeTask({ id: 't-mine', content: 'Take notes', projectId: project.id, assigneeId: TEST_USER.id }),
    ]);
    open(project);

    expect(await screen.findByText(/You can view this project, but not change it/)).toBeInTheDocument();
    await screen.findByText('Approve budget');
    expect(screen.queryByRole('button', { name: /Add task/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add section/ })).not.toBeInTheDocument();

    const rows = screen.getAllByRole('checkbox', { name: 'Complete task' });
    const other = screen.getByRole('button', { name: 'Open task: Approve budget' }).parentElement!;
    const mine = screen.getByRole('button', { name: 'Open task: Take notes' }).parentElement!;
    expect(rows).toHaveLength(2);
    expect(within(other).getByRole('checkbox')).toBeDisabled();
    expect(within(mine).getByRole('checkbox')).toBeEnabled();
  });

  it('opens a task read-only for a viewer, with comments read but not written', async () => {
    const project = makeProject({ id: 'p-view2', access: 'VIEW' });
    serve(project, [makeTask({ id: 't1', content: 'Approve budget', projectId: project.id })]);
    open(project, '?task=t1');

    const panel = await screen.findByRole('dialog', { name: 'Task detail' });
    expect(within(panel).getByText('You can view this task, but not change it.')).toBeInTheDocument();
    expect(within(panel).queryByPlaceholderText('Write a comment...')).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: /Add subtask/ })).not.toBeInTheDocument();
  });

  it('lets a commenter comment on a task they can’t change', async () => {
    const project = makeProject({ id: 'p-comment', access: 'COMMENT' });
    serve(project, [makeTask({ id: 't1', content: 'Approve budget', projectId: project.id })]);
    open(project, '?task=t1');

    const panel = await screen.findByRole('dialog', { name: 'Task detail' });
    expect(within(panel).getByText('You can comment on this task, but not change it.')).toBeInTheDocument();
    expect(await within(panel).findByPlaceholderText('Write a comment...')).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('shows everything to an editor', async () => {
    const project = makeProject({ id: 'p-edit', access: 'EDIT' });
    serve(project, [makeTask({ id: 't1', content: 'Approve budget', projectId: project.id })]);
    open(project);

    await screen.findByText('Approve budget');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Complete task' })).toBeEnabled();
    expect(screen.getAllByRole('button', { name: /Add section/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Add task/ })).toBeInTheDocument();
  });
});
