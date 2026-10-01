import '../mocks/socket';
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { API } from '../msw/handlers';
import { ok, TEST_USER } from '../msw/fixtures';
import { renderPage } from '../helpers/renderPage';
import { ShareProjectDialog } from '@/components/project/ShareProjectDialog';

const person = (id: string, name: string, email: string | null = `${id}@example.com`) => ({ id, name, email, avatarUrl: null });
const ADDED_AT = '2026-09-28T10:00:00.000Z';

function serveSharing(initial: { canManage: boolean; collaborators: { user: ReturnType<typeof person>; role: string }[] }) {
  let collaborators = initial.collaborators.map((c) => ({ ...c, addedAt: ADDED_AT }));
  const calls: { method: string; body?: unknown; userId?: string }[] = [];
  server.use(
    http.get(`${API}/projects/:id/collaborators`, () =>
      HttpResponse.json(
        ok({ owner: person('owner', 'Olive Owner'), workspace: null, collaborators, canManage: initial.canManage }),
      ),
    ),
    http.post(`${API}/projects/:id/collaborators`, async ({ request }) => {
      const body = (await request.json()) as { email: string; role: string };
      calls.push({ method: 'POST', body });
      if (body.email === 'ghost@example.com') {
        return HttpResponse.json({ success: false, message: 'No one with that email address has an account here.' }, { status: 404 });
      }
      const added = { user: person('new', 'Nia New', body.email), role: body.role, addedAt: ADDED_AT };
      collaborators = [...collaborators, added];
      return HttpResponse.json(ok(added), { status: 201 });
    }),
    http.patch(`${API}/projects/:id/collaborators/:userId`, async ({ request, params }) => {
      calls.push({ method: 'PATCH', body: await request.json(), userId: String(params.userId) });
      return HttpResponse.json(ok(collaborators[0]));
    }),
    http.delete(`${API}/projects/:id/collaborators/:userId`, ({ params }) => {
      calls.push({ method: 'DELETE', userId: String(params.userId) });
      collaborators = collaborators.filter((c) => c.user.id !== params.userId);
      return HttpResponse.json({ success: true, message: 'Removed' });
    }),
  );
  return calls;
}

const project = { id: 'p1', name: 'Garden' };

describe('Share project dialog', () => {
  it('shares with someone by email and lists them', async () => {
    const calls = serveSharing({ canManage: true, collaborators: [] });
    const { user } = renderPage(<ShareProjectDialog isOpen onClose={() => {}} project={project} />);

    const dialog = await screen.findByRole('dialog', { name: 'Share “Garden”' });
    expect(await within(dialog).findByText('Not shared with anyone yet.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Share with'), 'nia@example.com');
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Role' }), 'COMMENTER');
    await user.click(within(dialog).getByRole('button', { name: 'Share' }));

    await waitFor(() => expect(calls).toContainEqual({ method: 'POST', body: { email: 'nia@example.com', role: 'COMMENTER' } }));
    expect(await within(dialog).findByText('Nia New')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Share with')).toHaveValue('');
  });

  it('says why when there is no such account', async () => {
    serveSharing({ canManage: true, collaborators: [] });
    const { user } = renderPage(<ShareProjectDialog isOpen onClose={() => {}} project={project} />);
    const dialog = await screen.findByRole('dialog');
    await user.type(await within(dialog).findByLabelText('Share with'), 'ghost@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Share' }));
    expect(await within(dialog).findByText(/No one with that email address/)).toBeInTheDocument();
  });

  it('admins change roles and remove people', async () => {
    const calls = serveSharing({ canManage: true, collaborators: [{ user: person('sam', 'Sam Smith'), role: 'MEMBER' }] });
    const { user } = renderPage(<ShareProjectDialog isOpen onClose={() => {}} project={project} />);
    const dialog = await screen.findByRole('dialog');

    await user.selectOptions(await within(dialog).findByRole('combobox', { name: 'Role for Sam Smith' }), 'VIEWER');
    await waitFor(() => expect(calls).toContainEqual({ method: 'PATCH', body: { role: 'VIEWER' }, userId: 'sam' }));
    await user.click(within(dialog).getByRole('button', { name: 'Remove Sam Smith' }));
    await waitFor(() => expect(calls).toContainEqual({ method: 'DELETE', userId: 'sam' }));
    expect(await within(dialog).findByText('Not shared with anyone yet.')).toBeInTheDocument();
  });

  it('others see the list, and can leave', async () => {
    const calls = serveSharing({
      canManage: false,
      collaborators: [{ user: person(TEST_USER.id, TEST_USER.name, null), role: 'VIEWER' }],
    });
    const onLeft = vi.fn();
    const { user } = renderPage(<ShareProjectDialog isOpen onClose={() => {}} project={project} onLeft={onLeft} />);
    const dialog = await screen.findByRole('dialog');

    expect(await within(dialog).findByText('Viewer')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Share with')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(calls).toContainEqual({ method: 'DELETE', userId: TEST_USER.id }));
    await waitFor(() => expect(onLeft).toHaveBeenCalled());
  });
});
