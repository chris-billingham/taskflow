import '../mocks/socket';
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { API } from '../msw/handlers';
import { ok, TEST_USER } from '../msw/fixtures';
import { renderPage } from '../helpers/renderPage';
import { LabelManager } from '@/components/label/LabelManager';
import { LabelPicker } from '@/components/task/LabelPicker';

const label = (id: string, name: string, space: { userId?: string; workspaceId?: string }) => ({
  id,
  name,
  color: '#6B7280',
  userId: space.userId ?? null,
  workspaceId: space.workspaceId ?? null,
  isFavorite: false,
  sortOrder: 0,
  createdAt: '2026-09-28T10:00:00.000Z',
  updatedAt: '2026-09-28T10:00:00.000Z',
});

const workspaces = [{ id: 'ws-1', name: 'Acme', role: 'MEMBER', _count: { members: 3, projects: 1 } }];

describe('labels by space', () => {
  it('lists your labels and each workspace’s team labels separately', async () => {
    server.use(
      http.get(`${API}/workspaces`, () => HttpResponse.json(ok(workspaces))),
      http.get(`${API}/labels`, () =>
        HttpResponse.json(ok([label('l1', 'Errand', { userId: TEST_USER.id }), label('l2', 'Release', { workspaceId: 'ws-1' })])),
      ),
    );
    renderPage(<LabelManager />);

    const mine = await screen.findByRole('heading', { name: 'My labels' });
    const team = screen.getByRole('heading', { name: 'Acme labels' });
    expect(mine.compareDocumentPosition(screen.getByText('Errand')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(team.compareDocumentPosition(screen.getByText('Release')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('creates a team label in the chosen workspace', async () => {
    const created = vi.fn();
    server.use(
      http.get(`${API}/workspaces`, () => HttpResponse.json(ok(workspaces))),
      http.post(`${API}/labels`, async ({ request }) => {
        const body = (await request.json()) as { name: string; workspaceId?: string };
        created(body);
        return HttpResponse.json(ok(label('l9', body.name, { workspaceId: body.workspaceId })), { status: 201 });
      }),
    );
    const { user } = renderPage(<LabelManager />);

    await user.click(screen.getByRole('button', { name: 'Add label' }));
    await user.type(screen.getByPlaceholderText('Label name'), 'Blocked');
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Where' }), 'ws-1');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(created).toHaveBeenCalledWith(expect.objectContaining({ name: 'Blocked', workspaceId: 'ws-1' })));
  });
});

describe('label picker', () => {
  it('offers the labels of the task’s project', async () => {
    const asked = vi.fn();
    server.use(
      http.get(`${API}/labels`, ({ request }) => {
        asked(new URL(request.url).searchParams.get('projectId'));
        return HttpResponse.json(ok([label('l2', 'Release', { workspaceId: 'ws-1' })]));
      }),
    );
    const { user } = renderPage(<LabelPicker projectId="p-team" selectedIds={[]} onChange={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Labels' }));
    expect(await screen.findByText('Release')).toBeInTheDocument();
    expect(asked).toHaveBeenCalledWith('p-team');
    expect(within(document.body).queryByText('Errand')).not.toBeInTheDocument();
  });
});
