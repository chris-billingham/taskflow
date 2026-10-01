import '../mocks/socket';
import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router';
import { server } from '../msw/server';
import { API } from '../msw/handlers';
import { ok, TEST_USER } from '../msw/fixtures';
import { renderPage } from '../helpers/renderPage';
import WorkspaceSettingsPage from '@/pages/settings/Workspace';

const member = (userId: string, name: string, role: string) => ({
  id: `m-${userId}`,
  workspaceId: 'ws-1',
  userId,
  role,
  joinedAt: '2026-09-28T10:00:00.000Z',
  user: { id: userId, name, email: `${userId}@example.com`, avatarUrl: null },
});

function serve(myRole: 'OWNER' | 'MEMBER') {
  const calls: { path: string; body?: unknown }[] = [];
  server.use(
    http.get(`${API}/workspaces`, () =>
      HttpResponse.json(ok([{ id: 'ws-1', name: 'Acme', slug: 'acme', description: null, role: myRole, _count: { members: 3, projects: 2 } }])),
    ),
    http.get(`${API}/workspaces/:id/members`, () =>
      HttpResponse.json(
        ok([
          member(TEST_USER.id, TEST_USER.name, myRole),
          member('u-sam', 'Sam Member', myRole === 'OWNER' ? 'MEMBER' : 'OWNER'),
          member('u-gus', 'Gus Guest', 'GUEST'),
        ]),
      ),
    ),
    http.get(`${API}/workspaces/:id/invites`, () => HttpResponse.json(ok([]))),
    http.post(`${API}/workspaces/:id/leave`, () => {
      calls.push({ path: 'leave' });
      return HttpResponse.json({ success: true, message: 'Left' });
    }),
    http.post(`${API}/workspaces/:id/transfer`, async ({ request }) => {
      calls.push({ path: 'transfer', body: await request.json() });
      return HttpResponse.json({ success: true, message: 'Transferred' });
    }),
  );
  return calls;
}

const renderSettings = () =>
  renderPage(
    <Routes>
      <Route path="/workspaces/:id/settings" element={<WorkspaceSettingsPage />} />
    </Routes>,
    { route: '/workspaces/ws-1/settings', path: '/*' },
  );

describe('workspace ownership', () => {
  it('a member can leave, after confirming', async () => {
    const calls = serve('MEMBER');
    const { user } = renderSettings();
    await user.click(await screen.findByRole('button', { name: 'Leave' }));
    await user.click(screen.getByRole('button', { name: 'Leave workspace' }));
    const dialog = screen.getByRole('dialog', { name: 'Leave Acme?' });
    await user.click(within(dialog).getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(calls).toContainEqual({ path: 'leave' }));
    await waitFor(() => expect(screen.getByTestId('current-url')).toHaveTextContent('/today'));
  });

  it('the owner hands over to a member, never a guest', async () => {
    const calls = serve('OWNER');
    const { user } = renderSettings();
    await user.click(await screen.findByRole('button', { name: 'Ownership' }));
    const select = await screen.findByRole('combobox', { name: 'New owner' });
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Sam Member' })).toBeInTheDocument());
    expect(within(select).queryByRole('option', { name: 'Gus Guest' })).not.toBeInTheDocument();

    await user.selectOptions(select, 'u-sam');
    await user.click(screen.getByRole('button', { name: 'Transfer' }));
    const dialog = screen.getByRole('dialog', { name: 'Transfer ownership?' });
    expect(within(dialog).getByText(/Sam Member will own Acme/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Transfer' }));
    await waitFor(() => expect(calls).toContainEqual({ path: 'transfer', body: { newOwnerId: 'u-sam' } }));
  });
});

