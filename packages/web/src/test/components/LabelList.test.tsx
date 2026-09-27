import { describe, it, expect } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { API } from '../msw/handlers';
import { ok } from '../msw/fixtures';
import { renderPage } from '../helpers/renderPage';
import { LabelList } from '@/components/label/LabelList';

function serveLabels() {
  const label = { id: 'l-1', name: 'urgent', color: '#EF4444', isFavorite: false, sortOrder: 0 };
  const deleted: string[] = [];
  server.use(
    http.get(`${API}/labels`, () => HttpResponse.json(ok([label]))),
    http.delete(`${API}/labels/:id`, ({ params }) => {
      deleted.push(params.id as string);
      return HttpResponse.json(ok({ message: 'deleted' }));
    }),
  );
  return deleted;
}

describe('LabelList row menu', () => {
  it('opens from the labelled trigger without navigating, and deletes', async () => {
    const deleted = serveLabels();
    const { user } = renderPage(<LabelList />);

    await user.click(await screen.findByRole('button', { name: /^Options for / }));
    expect(screen.getByTestId('current-url')).toHaveTextContent(/^\/$/);
    expect(screen.getByRole('menuitem', { name: 'Add to favorites' })).toHaveFocus();

    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await waitFor(() => expect(deleted).toEqual(['l-1']));
  });

  it('also opens on right-click of the row, and Escape returns focus to the trigger', async () => {
    serveLabels();
    const { user } = renderPage(<LabelList />);

    fireEvent.contextMenu(await screen.findByText('urgent'));
    expect(screen.getByRole('menu', { name: /^Options for / })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Options for / })).toHaveFocus();
  });
});
