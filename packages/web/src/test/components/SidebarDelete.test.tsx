import '../mocks/socket';
import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { API } from '../msw/handlers';
import { makeProject, ok } from '../msw/fixtures';
import { renderPage } from '../helpers/renderPage';
import { Sidebar } from '@/components/layout/Sidebar';

function serveProjects() {
  const project = makeProject({ id: 'p-reno', name: 'Home reno' });
  const deleted: string[] = [];
  server.use(
    http.get(`${API}/projects`, () => HttpResponse.json(ok([project]))),
    http.delete(`${API}/projects/:id`, ({ params }) => {
      deleted.push(params.id as string);
      return HttpResponse.json(ok({ message: 'deleted' }));
    }),
  );
  return deleted;
}

// The sidebar renders twice (mobile drawer and desktop column); use the first.
async function openDeleteFromMenu(user: ReturnType<typeof renderPage>['user']) {
  await screen.findAllByText('Home reno');
  await user.click(screen.getAllByTitle('Project options')[0]);
  await user.click(screen.getByRole('button', { name: 'Delete' }));
}

describe('Sidebar project delete', () => {
  it('asks before deleting, and does nothing on cancel', async () => {
    const deleted = serveProjects();
    const { user } = renderPage(<Sidebar isOpen onClose={() => {}} />);

    await openDeleteFromMenu(user);
    const dialog = await screen.findByRole('dialog', { name: 'Delete project?' });
    expect(within(dialog).getByText(/permanently deletes "Home reno"/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog', { name: 'Delete project?' })).not.toBeInTheDocument();
    expect(deleted).toEqual([]);
  });

  it('deletes once confirmed', async () => {
    const deleted = serveProjects();
    const { user } = renderPage(<Sidebar isOpen onClose={() => {}} />);

    await openDeleteFromMenu(user);
    const dialog = await screen.findByRole('dialog', { name: 'Delete project?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleted).toEqual(['p-reno']));
  });
});
