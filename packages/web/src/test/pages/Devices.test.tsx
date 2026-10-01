import '../mocks/socket';
import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { API } from '../msw/handlers';
import { ok } from '../msw/fixtures';
import { renderPage } from '../helpers/renderPage';
import Devices from '@/pages/settings/Devices';

const now = new Date().toISOString();

function serve() {
  let sessions = [
    { id: 's-here', name: 'Firefox on macOS', client: 'WEB', startedAt: now, lastUsedAt: now, current: true },
    { id: 's-phone', name: 'Pat’s iPhone', client: 'APP', startedAt: now, lastUsedAt: now, current: false },
  ];
  let tokens: unknown[] = [];
  const calls: string[] = [];
  server.use(
    http.get(`${API}/sessions`, () => HttpResponse.json(ok(sessions))),
    http.delete(`${API}/sessions/:id`, ({ params }) => {
      calls.push(`revoke ${params.id}`);
      sessions = sessions.filter((s) => s.id !== params.id);
      return HttpResponse.json({ success: true, message: 'ok' });
    }),
    http.get(`${API}/tokens`, () => HttpResponse.json(ok(tokens))),
    http.post(`${API}/tokens`, async ({ request }) => {
      const body = (await request.json()) as { name: string; scope: string; expiresInDays?: number };
      calls.push(`create ${body.name} ${body.scope} ${body.expiresInDays ?? 'never'}`);
      const token = { id: 't1', name: body.name, prefix: 'tfp_abcd', scope: body.scope, lastUsedAt: null, expiresAt: null, createdAt: now };
      tokens = [token];
      return HttpResponse.json(ok({ ...token, token: 'tfp_abcdSECRET' }), { status: 201 });
    }),
  );
  return calls;
}

describe('Devices & tokens', () => {
  it('lists devices, this one first, and signs another out', async () => {
    const calls = serve();
    const { user } = renderPage(<Devices />);
    expect(await screen.findByText('This device')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out Pat’s iPhone' }));
    await waitFor(() => expect(calls).toContain('revoke s-phone'));
    await waitFor(() => expect(screen.queryByText('Pat’s iPhone')).not.toBeInTheDocument());
  });

  it('creates a token and shows it once', async () => {
    const calls = serve();
    const { user } = renderPage(<Devices />);
    await user.type(await screen.findByPlaceholderText('e.g. Calendar sync'), 'Backup script');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Access' }), 'WRITE');
    await user.click(screen.getByRole('button', { name: 'Create token' }));
    await waitFor(() => expect(calls).toContain('create Backup script WRITE 90'));
    expect(await screen.findByText(/Copy “Backup script” now/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'New token' })).toHaveValue('tfp_abcdSECRET');
    expect(await screen.findByText('tfp_abcd…')).toBeInTheDocument();
  });
});
