import '../mocks/socket';
import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { API } from '../msw/handlers';
import { makeProject, makeSection, makeTask, ok } from '../msw/fixtures';
import { renderPage } from '../helpers/renderPage';
import { TaskItem } from '@/components/task/TaskItem';

function serveProjects() {
  const home = makeProject({ id: 'p-home', name: 'Home' });
  const work = makeProject({ id: 'p-work', name: 'Work' });
  work.sections = [makeSection({ id: 's-next', name: 'Next week', projectId: 'p-work' })];
  server.use(http.get(`${API}/projects`, () => HttpResponse.json(ok([home, work]))));
}

describe('Move to…', () => {
  it('moves a task to a section picked by typing and Enter, with Undo', async () => {
    serveProjects();
    const moves: unknown[] = [];
    server.use(
      http.post(`${API}/tasks/t1/move`, async ({ request }) => {
        moves.push(await request.json());
        return HttpResponse.json(ok(makeTask({ id: 't1' })));
      }),
    );
    const { user } = renderPage(<TaskItem task={makeTask({ id: 't1', content: 'Plan sprint', projectId: 'p-home' })} />);

    await user.click(screen.getByRole('button', { name: 'Options for Plan sprint' }));
    await user.click(screen.getByRole('menuitem', { name: 'Move to…' }));
    const dialog = screen.getByRole('dialog', { name: 'Move to…' });
    // The current project is marked.
    expect(await within(dialog).findByLabelText('Current location')).toBeInTheDocument();

    await user.type(within(dialog).getByRole('textbox', { name: 'Search projects and sections' }), 'next');
    expect(within(dialog).getAllByRole('option')).toHaveLength(1);
    await user.keyboard('{Enter}');

    await waitFor(() => expect(moves).toEqual([{ projectId: 'p-work', sectionId: 's-next' }]));
    const toast = (await screen.findByText('Moved to Work / Next week')).parentElement!;
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(moves[1]).toMatchObject({ projectId: 'p-home', sectionId: null }));
  });

  it('says so when nothing matches', async () => {
    serveProjects();
    const { user } = renderPage(<TaskItem task={makeTask({ id: 't1', content: 'Plan sprint' })} />);
    await user.click(screen.getByRole('button', { name: 'Options for Plan sprint' }));
    await user.click(screen.getByRole('menuitem', { name: 'Move to…' }));
    await user.type(screen.getByRole('textbox', { name: 'Search projects and sections' }), 'zzz');
    expect(screen.getByText('No matching project or section')).toBeInTheDocument();
  });
});
