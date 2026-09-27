import '../mocks/socket';
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { API } from '../msw/handlers';
import { ok } from '../msw/fixtures';
import { renderPage } from '../helpers/renderPage';
import { Sidebar } from '@/components/layout/Sidebar';
import { useAuthStore } from '@/stores/authStore';
import { makeProject } from '../msw/fixtures';

// The sidebar renders twice while the drawer is open (desktop column and
// mobile drawer); these tests keep the drawer closed so there is one of each.

describe('Sidebar account menu', () => {
  it('opens from the keyboard and signs out', async () => {
    const { user } = renderPage(<Sidebar isOpen={false} onClose={() => {}} />);
    // logout() does a full-page reload, which jsdom can't do.
    const logout = vi.fn(async () => {});
    useAuthStore.setState({ logout });

    const trigger = screen.getByRole('button', { name: /account menu$/i });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    trigger.focus();
    await user.keyboard('{ArrowDown}');

    const menu = screen.getByRole('menu', { name: /account menu$/i });
    expect(within(menu).getByRole('menuitem', { name: 'Settings' })).toHaveFocus();

    await user.keyboard('{End}{Enter}');
    expect(logout).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId('current-url')).toHaveTextContent('/login'));
  });

  it('navigates to settings and closes', async () => {
    const { user } = renderPage(<Sidebar isOpen={false} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /account menu$/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Settings' }));
    expect(screen.getByTestId('current-url')).toHaveTextContent('/settings/profile');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('Sidebar spaces', () => {
  it('shows your own projects, each workspace, and projects shared with you', async () => {
    server.use(
      http.get(`${API}/workspaces`, () =>
        HttpResponse.json(ok([{ id: 'ws-1', name: 'Acme', role: 'MEMBER', _count: { members: 3, projects: 1 } }])),
      ),
      http.get(`${API}/projects`, () =>
        HttpResponse.json(
          ok([
            makeProject({ id: 'inbox', name: 'Inbox', isInbox: true }),
            makeProject({ id: 'p-mine', name: 'Garden' }),
            makeProject({ id: 'p-team', name: 'Launch', workspaceId: 'ws-1', ownerId: 'someone' }),
            makeProject({ id: 'p-shared', name: 'Their plan', ownerId: 'someone-else' }),
          ]),
        ),
      ),
    );
    const { user } = renderPage(<Sidebar isOpen={false} onClose={() => {}} />);

    await screen.findByText('Launch');
    expect(screen.queryByRole('button', { name: /switch workspace/i })).not.toBeInTheDocument();
    const acme = screen.getByRole('button', { name: 'Acme' });
    expect(acme).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Shared with me')).toBeInTheDocument();
    expect(screen.getByText('Their plan')).toBeInTheDocument();
    expect(screen.getByText('Garden')).toBeInTheDocument();

    await user.click(acme);
    expect(screen.queryByText('Launch')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Acme settings' }));
    expect(screen.getByTestId('current-url')).toHaveTextContent('/workspaces/ws-1/settings');
  });

  it('starts a new workspace from the sidebar', async () => {
    const { user } = renderPage(<Sidebar isOpen={false} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'New workspace' }));
    expect(screen.getByRole('dialog', { name: 'Create workspace' })).toBeInTheDocument();
  });
});

describe('Mobile drawer', () => {
  it('closes on Escape, but not when a menu inside used it', async () => {
    const onClose = vi.fn();
    const { user } = renderPage(<Sidebar isOpen onClose={onClose} />);

    await user.click(screen.getAllByRole('button', { name: /account menu$/i })[1]);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
