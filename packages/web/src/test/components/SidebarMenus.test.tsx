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
import { useWorkspaceStore } from '@/stores/workspaceStore';

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
    // No workspace selected, so no workspace settings entry.
    expect(within(menu).queryByRole('menuitem', { name: 'Workspace settings' })).not.toBeInTheDocument();

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

describe('Workspace switcher', () => {
  it('marks the current workspace and switches to another', async () => {
    server.use(
      http.get(`${API}/workspaces`, () =>
        HttpResponse.json(ok([{ id: 'ws-1', name: 'Acme', _count: { members: 3 } }])),
      ),
    );
    const { user } = renderPage(<Sidebar isOpen={false} onClose={() => {}} />);

    await user.click(screen.getByRole('button', { name: /switch workspace$/i }));
    const personal = screen.getByRole('menuitemradio', { name: 'Personal' });
    expect(personal).toHaveAttribute('aria-checked', 'true');
    expect(personal).toHaveFocus();

    await user.click(await screen.findByRole('menuitemradio', { name: /Acme/ }));
    expect(useWorkspaceStore.getState().currentWorkspaceId).toBe('ws-1');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
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
