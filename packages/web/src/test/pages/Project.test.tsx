import '../mocks/socket';
import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { API } from '../msw/handlers';
import { makeProject, makeSection, makeTask, ok } from '../msw/fixtures';
import { renderPage } from '../helpers/renderPage';
import type { Project as ProjectType } from '@/types/project';
import type { Task } from '@/types/task';
import Project from '@/pages/app/Project';

/** Serve a project and its task pages. Each page is [tasks, nextCursor]. */
function serveProject(project: ProjectType, pages: Array<[Task[], string | null]>) {
  const taskRequests: URL[] = [];
  server.use(
    http.get(`${API}/projects/${project.id}`, () => HttpResponse.json(ok(project))),
    http.get(`${API}/tasks`, ({ request }) => {
      const url = new URL(request.url);
      taskRequests.push(url);
      const cursor = url.searchParams.get('cursor');
      const index = cursor ? pages.findIndex((_, i) => pages[i - 1]?.[1] === cursor) : 0;
      const [tasks, nextCursor] = pages[Math.max(index, 0)];
      return HttpResponse.json(ok(tasks, { nextCursor }));
    }),
    // A deep-linked task may be requested before the list has loaded.
    http.get(`${API}/tasks/:taskId`, ({ params }) => {
      const task = pages.flatMap(([tasks]) => tasks).find((t) => t.id === params.taskId);
      return task
        ? HttpResponse.json(ok(task))
        : HttpResponse.json({ success: false, error: 'NOT_FOUND', message: 'Task not found' }, { status: 404 });
    }),
  );
  return taskRequests;
}

function openProject(project: ProjectType, query = '') {
  return renderPage(<Project />, {
    route: `/projects/${project.id}${query}`,
    path: '/projects/:id',
  });
}

describe('Project page', () => {
  it('shows the project, its loose tasks, and each section with its tasks', async () => {
    const project = makeProject({ id: 'p-web', name: 'Website relaunch' });
    const design = makeSection({ id: 's-design', name: 'Design', projectId: project.id });
    project.sections = [design];
    const requests = serveProject(project, [
      [
        [
          makeTask({ content: 'Pick a domain', projectId: project.id }),
          makeTask({ content: 'Draft the homepage', projectId: project.id, sectionId: design.id }),
        ],
        null,
      ],
    ]);

    openProject(project);

    expect(await screen.findByRole('heading', { level: 1, name: 'Website relaunch' })).toBeInTheDocument();
    expect(await screen.findByText('Pick a domain')).toBeInTheDocument();
    expect(screen.getByText('Design')).toBeInTheDocument();
    expect(screen.getByText('Draft the homepage')).toBeInTheDocument();
    expect(requests[0].searchParams.get('projectId')).toBe(project.id);
  });

  it('loads the next page of tasks with the cursor from the last one', async () => {
    const project = makeProject({ id: 'p-big' });
    const requests = serveProject(project, [
      [[makeTask({ content: 'First page task', projectId: project.id })], 'cursor-2'],
      [[makeTask({ content: 'Second page task', projectId: project.id, sortOrder: 1 })], null],
    ]);

    const { user } = openProject(project);
    await screen.findByText('First page task');
    await user.click(screen.getByRole('button', { name: 'Load more tasks' }));

    expect(await screen.findByText('Second page task')).toBeInTheDocument();
    expect(screen.getByText('First page task')).toBeInTheDocument();
    expect(requests[requests.length - 1].searchParams.get('cursor')).toBe('cursor-2');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Load more tasks' })).not.toBeInTheDocument(),
    );
  });

  it('opens the task named by ?task=', async () => {
    const project = makeProject({ id: 'p-link' });
    const task = makeTask({ id: 't-linked', content: 'Linked from a notification', projectId: project.id });
    serveProject(project, [[[task], null]]);

    openProject(project, `?task=${task.id}`);

    const panel = await screen.findByRole('dialog', { name: 'Task detail' });
    expect(within(panel).getByRole('heading', { name: 'Linked from a notification' })).toBeInTheDocument();
  });

  it('says so when the project does not exist', async () => {
    server.use(
      http.get(`${API}/projects/missing`, () =>
        HttpResponse.json({ success: false, error: 'NOT_FOUND', message: 'Project not found' }, { status: 404 }),
      ),
      http.get(`${API}/tasks`, () => HttpResponse.json(ok([], { nextCursor: null }))),
    );

    renderPage(<Project />, { route: '/projects/missing', path: '/projects/:id' });

    expect(await screen.findByRole('heading', { name: 'Project not found' })).toBeInTheDocument();
  });
});

describe('Project board view', () => {
  it('shows a column per section with its tasks', async () => {
    const project = makeProject({ id: 'p-board', name: 'Launch board', viewStyle: 'BOARD' });
    const todo = makeSection({ id: 's-todo', name: 'To do', projectId: project.id, sortOrder: 0 });
    const doing = makeSection({ id: 's-doing', name: 'Doing', projectId: project.id, sortOrder: 1 });
    project.sections = [todo, doing];
    serveProject(project, [
      [
        [
          makeTask({ content: 'Write copy', projectId: project.id, sectionId: todo.id }),
          makeTask({ content: 'Build the page', projectId: project.id, sectionId: doing.id }),
        ],
        null,
      ],
    ]);

    openProject(project);

    const todoColumn = await screen.findByRole('region', { name: 'To do column' });
    const doingColumn = screen.getByRole('region', { name: 'Doing column' });
    expect(await within(todoColumn).findByText('Write copy')).toBeInTheDocument();
    expect(within(doingColumn).getByText('Build the page')).toBeInTheDocument();
    expect(within(todoColumn).queryByText('Build the page')).not.toBeInTheDocument();
  });

  it('collapses a column from its header', async () => {
    const project = makeProject({ id: 'p-board2', viewStyle: 'BOARD' });
    const todo = makeSection({ id: 's-todo2', name: 'To do', projectId: project.id });
    project.sections = [todo];
    serveProject(project, [[[makeTask({ content: 'Write copy', projectId: project.id, sectionId: todo.id })], null]]);

    const { user } = openProject(project);
    const column = await screen.findByRole('region', { name: 'To do column' });
    await within(column).findByText('Write copy');
    await user.click(within(column).getByRole('button', { name: 'Collapse To do' }));

    expect(within(column).queryByText('Write copy')).not.toBeInTheDocument();
  });
});
