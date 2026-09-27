import '../mocks/socket';
import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { API } from '../msw/handlers';
import { makeTask, ok } from '../msw/fixtures';
import { renderPage } from '../helpers/renderPage';
import { toggleChecklistItem } from '@/components/ui/Markdown';

describe('toggleChecklistItem', () => {
  const src = 'Intro\n\n- [ ] Book venue\n- [x] Send invites\n  1. [ ] Nested';
  it('ticks and unticks the item at an offset', () => {
    expect(toggleChecklistItem(src, src.indexOf('- [ ]'))).toContain('- [x] Book venue');
    expect(toggleChecklistItem(src, src.indexOf('- [x]'))).toContain('- [ ] Send invites');
    expect(toggleChecklistItem(src, src.indexOf('  1.'))).toContain('1. [x] Nested');
  });
  it('leaves anything else alone', () => {
    expect(toggleChecklistItem(src, 0)).toBe(src);
  });
});

describe('task description', () => {
  function serve(description: string) {
    let task = makeTask({ id: 't1', content: 'Plan the party', description });
    const patches: Record<string, unknown>[] = [];
    server.use(
      http.get(`${API}/tasks/:id`, () => HttpResponse.json(ok(task))),
      http.patch(`${API}/tasks/:id`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        patches.push(body);
        task = { ...task, ...body };
        return HttpResponse.json(ok(task));
      }),
    );
    return patches;
  }
  const panel = () => screen.findByRole('dialog', { name: 'Task detail' });

  it('renders Markdown, with links that open elsewhere', async () => {
    serve('Bring **cake**.\n\nSee https://example.com/menu');
    renderPage(<p>Page</p>, { route: '/today?task=t1', path: '/today' });
    const dialog = await panel();

    expect(within(dialog).getByText('cake').tagName).toBe('STRONG');
    const link = within(dialog).getByRole('link', { name: 'https://example.com/menu' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('does not render raw HTML', async () => {
    serve('<img src=x onerror="alert(1)"> plain');
    renderPage(<p>Page</p>, { route: '/today?task=t1', path: '/today' });
    const dialog = await panel();
    await within(dialog).findByText(/plain/);
    expect(dialog.querySelector('img')).toBeNull();
  });

  it('ticks a checklist item straight from the rendered description', async () => {
    const patches = serve('- [ ] Balloons\n- [ ] Music');
    const { user } = renderPage(<p>Page</p>, { route: '/today?task=t1', path: '/today' });
    const dialog = await panel();

    const [, music] = within(dialog).getAllByRole('checkbox', { name: 'Not done' });
    await user.click(music);
    await waitFor(() => expect(patches).toContainEqual({ description: '- [ ] Balloons\n- [x] Music' }));
    // Ticking doesn't open the editor.
    expect(within(dialog).queryByRole('textbox', { name: 'Description' })).not.toBeInTheDocument();
  });

  it('edits from the pencil button and saves with Ctrl+Enter', async () => {
    const patches = serve('Old');
    const { user } = renderPage(<p>Page</p>, { route: '/today?task=t1', path: '/today' });
    const dialog = await panel();

    await user.click(within(dialog).getByRole('button', { name: 'Edit description' }));
    const box = within(dialog).getByRole('textbox', { name: 'Description' });
    await user.clear(box);
    await user.type(box, '_New_{Control>}{Enter}{/Control}');
    await waitFor(() => expect(patches).toContainEqual({ description: '_New_' }));
    expect(await within(dialog).findByText('New')).toHaveProperty('tagName', 'EM');
  });
});

