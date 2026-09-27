import '../mocks/socket';
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { API } from '../msw/handlers';
import { makeProject, ok } from '../msw/fixtures';
import { renderPage } from '../helpers/renderPage';
import ArchivedProjects from '@/pages/app/ArchivedProjects';
import { Sidebar } from '@/components/layout/Sidebar';
import { EditProjectModal } from '@/components/project/EditProjectModal';

describe('Archived projects', () => {
  it('lists archived projects and brings one back', async () => {
    let projects = [
      makeProject({ id: 'p-live', name: 'Live work' }),
      makeProject({ id: 'p-old', name: 'Old launch', isArchived: true, description: 'Spring 2025' }),
    ];
    const unarchived = vi.fn();
    server.use(
      http.get(`${API}/projects`, () => HttpResponse.json(ok(projects))),
      http.post(`${API}/projects/:id/unarchive`, ({ params }) => {
        unarchived(params.id);
        projects = projects.map((p) => (p.id === params.id ? { ...p, isArchived: false } : p));
        return HttpResponse.json(ok(projects.find((p) => p.id === params.id)));
      }),
    );
    const { user } = renderPage(<ArchivedProjects />);

    expect(await screen.findByRole('link', { name: 'Old launch' })).toHaveAttribute('href', '/projects/p-old');
    expect(screen.getByText('Personal · Spring 2025')).toBeInTheDocument();
    expect(screen.queryByText('Live work')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Unarchive Old launch' }));
    await waitFor(() => expect(unarchived).toHaveBeenCalledWith('p-old'));
    expect(await screen.findByText('No archived projects.')).toBeInTheDocument();
  });

  it('shows the sidebar link only when something is archived', async () => {
    server.use(
      http.get(`${API}/projects`, () =>
        HttpResponse.json(ok([makeProject({ name: 'Live work' }), makeProject({ name: 'Old', isArchived: true })])),
      ),
    );
    const { user } = renderPage(<Sidebar isOpen onClose={() => {}} />);
    const [link] = await screen.findAllByRole('button', { name: /Archived projects/ });
    expect(link).toHaveTextContent('1');
    await user.click(link);
    expect(screen.getByTestId('current-url')).toHaveTextContent('/archived');
  });
});

describe('Edit project dialog', () => {
  it('offers parents from the same space, never itself or its sub-projects', async () => {
    const self = makeProject({ id: 'p-self', name: 'Website' });
    server.use(
      http.get(`${API}/projects`, () =>
        HttpResponse.json(
          ok([
            self,
            makeProject({ id: 'p-child', name: 'Blog', parentId: 'p-self' }),
            makeProject({ id: 'p-grand', name: 'Posts', parentId: 'p-child' }),
            makeProject({ id: 'p-home', name: 'Home' }),
            makeProject({ id: 'p-team', name: 'Team thing', workspaceId: 'ws-1' }),
            makeProject({ id: 'p-inbox', name: 'Inbox', isInbox: true }),
          ]),
        ),
      ),
    );
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const { user } = renderPage(
      <EditProjectModal isOpen onClose={() => {}} project={self} onUpdate={onUpdate} onDelete={vi.fn()} onArchive={vi.fn()} />,
    );

    const select = screen.getByLabelText('Parent project');
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Home' })).toBeInTheDocument());
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['None (top level)', 'Home']);

    await user.selectOptions(select, 'p-home');
    await user.type(screen.getByLabelText('Description'), 'Marketing site');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onUpdate).toHaveBeenCalledWith(
      'p-self',
      expect.objectContaining({ parentId: 'p-home', description: 'Marketing site' }),
    );
  });

  it('leaves the parent alone when it was not changed', async () => {
    const self = makeProject({ id: 'p-self', name: 'Website', description: 'Old' });
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const { user } = renderPage(
      <EditProjectModal isOpen onClose={() => {}} project={self} onUpdate={onUpdate} onDelete={vi.fn()} onArchive={vi.fn()} />,
    );
    await user.clear(screen.getByLabelText('Description'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onUpdate.mock.calls[0][1]).not.toHaveProperty('parentId');
    expect(onUpdate.mock.calls[0][1]).toHaveProperty('description', null);
  });
});
